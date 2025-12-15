import { GraphQLError } from 'graphql';
import User from '../models/User';
import Quest from '../models/Quest';
import Submission from '../models/Submission';
import { hashPassword, comparePassword, createToken } from '../utils/auth';
import { pubsub } from '../pubsub'; 

export const resolvers = {
  Query: {
    users: async () => {
      return User.find().populate('quests');
    },

    user: async (_: any, { id }: any) => {
      const userDoc = await User.findById(id).populate('quests');
      if (!userDoc) {
        throw new GraphQLError('User not found', {
          extensions: { code: 'NOT_FOUND' },
        });
      }
      return userDoc;
    },

    quests: async (_: any, { subject }: any) => {
      if (subject) {
        return Quest.find({ subject }).populate('creator submissions');
      }
      return Quest.find().populate('creator submissions');
    },

    quest: async (_: any, { id }: any) => {
      const questDoc = await Quest.findById(id).populate('creator submissions');
      if (!questDoc) {
        throw new GraphQLError('Quest not found', {
          extensions: { code: 'NOT_FOUND' },
        });
      }
      return questDoc;
    },

    submissions: async (_: any, { questId }: any) => {
      return Submission.find({ quest: questId }).populate('author quest');
    },

    leaderboard: async () => {
      const users = await User.find().sort({ points: -1 }).limit(10);
      return users.map((user, index) => ({
        id: user._id.toString(),
        user,
        score: user.points,
        rank: index + 1,
        period: 'week',
      }));
    },

    monster: async (_: any, { userId }: any) => {
      const user = await User.findById(userId);
      const points = user?.points ?? 0;

      return {
        id: userId,
        name: points > 1000 ? 'Dragon' : points > 100 ? 'Orc' : 'Goblin',
        level: Math.floor(points / 100) + 1,
        hunger: Math.max(0, 100 - (points % 100)),
        multiplier: 1 + points / 1000,
        evolutionStage: points > 500 ? 'Adult' : 'Baby',
      };
    },
  },

  Mutation: {
    createUser: async (_: any, { name, email, password }: any) => {
      const trimmedName = name.trim();

      if (trimmedName.length < 2) {
        throw new GraphQLError('Name must be at least 2 characters', {
          extensions: { code: 'BAD_USER_INPUT' },
        });
      }

      if (!email.includes('@')) {
        throw new GraphQLError('Invalid email address', {
          extensions: { code: 'BAD_USER_INPUT' },
        });
      }

      if (password.length < 6) {
        throw new GraphQLError('Password must be at least 6 characters', {
          extensions: { code: 'BAD_USER_INPUT' },
        });
      }

      const existing = await User.findOne({ email });
      if (existing) {
        throw new GraphQLError('Email already in use', {
          extensions: { code: 'BAD_USER_INPUT' },
        });
      }

      const hashedPassword = await hashPassword(password);
      const user = new User({
        name: trimmedName,
        email,
        password: hashedPassword,
        level: 1,
        points: 0,
        isActive: true,
      });

      await user.save();
      return user;
    },

    login: async (_: any, { email, password }: any) => {
      if (!email || !password) {
        throw new GraphQLError('Email and password are required', {
          extensions: { code: 'BAD_USER_INPUT' },
        });
      }

      const user = await User.findOne({ email });
      const isValid = user && (await comparePassword(password, user.password));

      if (!isValid) {
        throw new GraphQLError('Invalid email or password', {
          extensions: { code: 'BAD_USER_INPUT' },
        });
      }

      return createToken(user!._id.toString());
    },

    createQuest: async (
      _: any,
      { title, description, subject, difficulty, reward }: any,
      { userId }: any,
    ) => {
      if (!userId) {
        throw new GraphQLError('Not authenticated', {
          extensions: { code: 'UNAUTHENTICATED' },
        });
      }

      const trimmedTitle = title.trim();
      const trimmedDescription = description.trim();

      if (trimmedTitle.length < 3 || trimmedTitle.length > 100) {
        throw new GraphQLError('Title must be 3–100 characters', {
          extensions: { code: 'BAD_USER_INPUT' },
        });
      }

      if (trimmedDescription.length < 5) {
        throw new GraphQLError('Description is too short', {
          extensions: { code: 'BAD_USER_INPUT' },
        });
      }

      if (difficulty < 1 || difficulty > 5) {
        throw new GraphQLError('Difficulty must be between 1 and 5', {
          extensions: { code: 'BAD_USER_INPUT' },
        });
      }

      if (reward < 10) {
        throw new GraphQLError('Reward must be at least 10 points', {
          extensions: { code: 'BAD_USER_INPUT' },
        });
      }

      const quest = new Quest({
        title: trimmedTitle,
        description: trimmedDescription,
        subject,
        difficulty,
        reward,
        creator: userId,
      });

      await quest.save();
      await User.findByIdAndUpdate(userId, { $push: { quests: quest._id } });

      return quest;
    },

    createSubmission: async (
  _: any,
  { content, questId, fileUrl }: any,
  { userId }: any,
) => {
  if (!userId) {
    throw new GraphQLError('Not authenticated', {
      extensions: { code: 'UNAUTHENTICATED' },
    });
  }

  const trimmedContent = content.trim();
  if (trimmedContent.length < 1) {
    throw new GraphQLError('Content cannot be empty', {
      extensions: { code: 'BAD_USER_INPUT' },
    });
  }

  const quest = await Quest.findById(questId);
  if (!quest) {
    throw new GraphQLError('Quest not found', {
      extensions: { code: 'NOT_FOUND' },
    });
  }

  const submission = new Submission({
    content: trimmedContent,
    quest: questId,
    author: userId,
    fileUrl: fileUrl ?? '',
    grade: 0,
  });

  await submission.save();

  await User.findByIdAndUpdate(userId, {
    $inc: { points: quest.reward },
  });

  await Quest.findByIdAndUpdate(questId, {
    $push: { submissions: submission._id },
  });

  // ✅ НОВОЕ: populate для subscription
  const submissionPopulated = await Submission.findById(submission._id)
    .populate('author', 'id name')
    .populate('quest', 'id title');

  pubsub.publish('NEW_SUBMISSION', { newSubmission: submissionPopulated });

  return submission;
},


    gradeSubmission: async (
      _: any,
      { submissionId, grade, feedback }: any,
      { userId }: any,
    ) => {
      if (!userId) {
        throw new GraphQLError('Not authenticated', {
          extensions: { code: 'UNAUTHENTICATED' },
        });
      }

      if (grade < 0 || grade > 100) {
        throw new GraphQLError('Grade must be between 0 and 100', {
          extensions: { code: 'BAD_USER_INPUT' },
        });
      }

      const submission = await Submission.findByIdAndUpdate(
        submissionId,
        { grade, feedback },
        { new: true },
      ).populate('author quest');

      if (!submission) {
        throw new GraphQLError('Submission not found', {
          extensions: { code: 'NOT_FOUND' },
        });
      }

      if (submission.author) {
        await User.findByIdAndUpdate(submission.author._id, {
          $inc: { points: grade * 10 },
        });
      }

      return submission;
    },

    updateQuest: async (
      _: any,
      { id, title, description }: any,
      { userId }: any,
    ) => {
      if (!userId) {
        throw new GraphQLError('Not authenticated', {
          extensions: { code: 'UNAUTHENTICATED' },
        });
      }

      const trimmedTitle = title.trim();
      const trimmedDescription = description.trim();

      if (trimmedTitle.length < 3 || trimmedTitle.length > 100) {
        throw new GraphQLError('Title must be 3–100 characters', {
          extensions: { code: 'BAD_USER_INPUT' },
        });
      }

      if (trimmedDescription.length < 5) {
        throw new GraphQLError('Description is too short', {
          extensions: { code: 'BAD_USER_INPUT' },
        });
      }

      const quest = await Quest.findOneAndUpdate(
        { _id: id, creator: userId },
        { title: trimmedTitle, description: trimmedDescription },
        { new: true },
      ).populate('creator submissions');

      if (!quest) {
        throw new GraphQLError('Quest not found', {
          extensions: { code: 'NOT_FOUND' },
        });
      }

      return quest;
    },

    deleteSubmission: async (_: any, { id }: any, { userId }: any) => {
      if (!userId) {
        throw new GraphQLError('Not authenticated', {
          extensions: { code: 'UNAUTHENTICATED' },
        });
      }

      const result = await Submission.findOneAndDelete({
        _id: id,
        author: userId,
      });

      if (!result) {
        throw new GraphQLError('Submission not found', {
          extensions: { code: 'NOT_FOUND' },
        });
      }

      return true;
    },
  },

  Subscription: {
  newSubmission: {
    subscribe: () => pubsub.asyncIterableIterator('NEW_SUBMISSION'),
  },
},
};
