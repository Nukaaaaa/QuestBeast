import { GraphQLError } from 'graphql';
import { ObjectId } from 'mongoose';
import User from '../models/User';
import Quest from '../models/Quest';
import Submission from '../models/Submission';
import { hashPassword, comparePassword, createToken } from '../utils/auth';
import { pubsub } from '../pubsub'; 

// 🔥 Helper для конвертации ObjectId в string
const convertToGraphQL = (doc: any): any => {
  if (!doc) return doc;
  
  const obj = doc.toObject ? doc.toObject() : { ...doc };
  obj.id = obj._id.toString();
  delete obj._id;
  delete obj.__v;
  
  if (obj.creator) {
    obj.creator.id = obj.creator._id.toString();
    delete obj.creator._id;
  }
  
  if (obj.author) {
    obj.author.id = obj.author._id.toString();
    delete obj.author._id;
  }
  
  if (obj.quest) {
    obj.quest.id = obj.quest._id.toString();
    delete obj.quest._id;
  }
  
  if (Array.isArray(obj.submissions)) {
    obj.submissions = obj.submissions.map(convertToGraphQL);
  }
  
  if (Array.isArray(obj.quests)) {
    obj.quests = obj.quests.map(convertToGraphQL);
  }
  
  return obj;
};

export const resolvers = {
  Query: {
    users: async () => {
      const users = await User.find().populate('quests');
      return users.map(convertToGraphQL);
    },

    user: async (_: any, { id }: { id: string }) => {
      const userDoc = await User.findById(id).populate('quests');
      if (!userDoc) {
        throw new GraphQLError('User not found', {
          extensions: { code: 'NOT_FOUND' },
        });
      }
      return convertToGraphQL(userDoc);
    },

    quests: async (_: any, { subject }: { subject?: string }) => {
      if (subject) {
        const quests = await Quest.find({ subject }).populate('creator submissions');
        return quests.map(convertToGraphQL);
      }
      const quests = await Quest.find().populate('creator submissions');
      return quests.map(convertToGraphQL);
    },

    quest: async (_: any, { id }: { id: string }) => {
      const questDoc = await Quest.findById(id).populate('creator submissions');
      if (!questDoc) throw new GraphQLError('Quest not found');
      return convertToGraphQL(questDoc);
    },

    submissions: async (_: any, { questId }: { questId: string }) => {
      const submissions = await Submission.find({ quest: questId }).populate('author quest');
      return submissions.map(convertToGraphQL);
    },

    leaderboard: async () => {
      const users = await User.find().sort({ points: -1 }).limit(10);
      return users.map((user, index) => ({
        id: user._id.toString(),
        user: convertToGraphQL(user),
        score: user.points,
        rank: index + 1,
        period: 'week',
      }));
    },

    monster: async (_: any, { userId }: { userId: string }) => {
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
    
    me: async (_: any, __: any, { userId }: { userId: string }) => {
      if (!userId) {
        throw new GraphQLError('Not authenticated', {
          extensions: { code: 'UNAUTHENTICATED' },
        });
      }
      const userDoc = await User.findById(userId).populate('quests');
      if (!userDoc) {
        throw new GraphQLError('User not found', {
          extensions: { code: 'NOT_FOUND' },
        });
      }
      return convertToGraphQL(userDoc);
    },
  },
  
  Mutation: {
    createUser: async (_: any, { name, email, password }: { name: string, email: string, password: string }) => {
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
      return convertToGraphQL(user);
    },

    login: async (_: any, { email, password }: { email: string, password: string }) => {
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
      { title, description, subject, difficulty, reward }: { 
        title: string, description: string, subject: string, 
        difficulty: number, reward: number 
      },
      { userId }: { userId: string },
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

      return convertToGraphQL(quest);
    },

    createSubmission: async (
      _: any,
      { content, questId, fileUrl }: { content: string, questId: string, fileUrl?: string },
      { userId }: { userId: string },
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

      const submissionPopulated = await Submission.findById(submission._id)
        .populate('author', 'name')
        .populate('quest', 'title');
      
      pubsub.publish('NEW_SUBMISSION', { newSubmission: convertToGraphQL(submissionPopulated) });

      return convertToGraphQL(submission);
    },

    gradeSubmission: async (
      _: any,
      { submissionId, grade, feedback }: { submissionId: string, grade: number, feedback?: string },
      { userId }: { userId: string },
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
        await User.findByIdAndUpdate((submission.author as any)._id, {
          $inc: { points: grade * 10 },
        });
      }

      return convertToGraphQL(submission);
    },

    updateQuest: async (
      _: any,
      { id, title, description }: { id: string, title: string, description: string },
      { userId }: { userId: string },
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

      return convertToGraphQL(quest);
    },

    deleteSubmission: async (_: any, { id }: { id: string }, { userId }: { userId: string }) => {
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
  
  User: {
    monster: async (user: any) => {
      const points = user.points ?? 0;
      return {
        id: user.id || user._id?.toString(),
        name: points > 1000 ? 'Dragon' : points > 100 ? 'Orc' : 'Goblin',
        level: Math.floor(points / 100) + 1,
        hunger: Math.max(0, 100 - (points % 100)),
        multiplier: 1 + points / 1000,
        evolutionStage: points > 500 ? 'Adult' : 'Baby',
      };
    },
  },
};
