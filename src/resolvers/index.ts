import { GraphQLError } from 'graphql';
import User from '../models/User';
import Quest from '../models/Quest';
import Submission from '../models/Submission';
import Monster from '../models/Monster';
import Leaderboard from '../models/LeadBoard';
import { hashPassword, comparePassword, createToken } from '../utils/auth';
import { pubsub } from '../pubsub'; 

const toGraphQLId = (doc: any) => {
  if (!doc || !doc._id) return doc;
  const obj = { ...doc };
  obj.id = obj._id.toString();
  
  // Populate поля
  if (obj.creator?. _id) obj.creator.id = obj.creator._id.toString();
  if (obj.author?. _id) obj.author.id = obj.author._id.toString();
  if (obj.quest?. _id) obj.quest.id = obj.quest._id.toString();
  
  // Массивы
  if (obj.submissions) obj.submissions = obj.submissions.map(toGraphQLId);
  if (obj.quests) obj.quests = obj.quests.map(toGraphQLId);
  
  delete obj._id;
  return obj;
};

const updateUserStats = async (userId: string, pointsToAdd: number) => {
  const user = await User.findByIdAndUpdate(userId, { $inc: { points: pointsToAdd } }, { new: true });
  if (!user) return;

  const monster = await Monster.findOne({ user: userId });
  if (monster) {
    const points = user.points;
    monster.level = Math.floor(points / 100) + 1;
    monster.hunger = Math.max(0, 100 - (points % 100));
    monster.multiplier = 1 + points / 1000;
    monster.evolutionStage = points > 500 ? 'adult' : 'baby';
    monster.name = points > 1000 ? 'Dragon' : points > 100 ? 'Orc' : 'Goblin';
    await monster.save();
  }

  await Leaderboard.findOneAndUpdate({ user: userId }, { score: user.points });
};

export const resolvers = {
  Query: {
    users: async () => {
      const users = await User.find().populate('quests').lean();
      return users.map(user => ({ id: user._id.toString(), ...user }));
    },

    user: async (_: any, { id }: { id: string }) => {
      const userDoc = await User.findById(id).populate('quests').lean();
      if (!userDoc) {
        throw new GraphQLError('User not found', { extensions: { code: 'NOT_FOUND' } });
      }
      return { id: userDoc._id.toString(), ...userDoc };
    },

    quests: async (_: any, { subject }: { subject?: string }) => {
      const quests = await (subject ? Quest.find({ subject }) : Quest.find())
        .populate('creator submissions').lean();
      return quests.map(toGraphQLId);
    },

    quest: async (_: any, { id }: { id: string }) => {
      const questDoc = await Quest.findById(id).populate('creator submissions').lean();
      if (!questDoc) {
        throw new GraphQLError('Quest not found', { extensions: { code: 'NOT_FOUND' } });
      }
      return toGraphQLId(questDoc);
    },

    submissions: async (_: any, { questId }: { questId: string }) => {
      const subs = await Submission.find({ quest: questId }).populate('author quest').lean();
      return subs.map(s => ({ id: s._id.toString(), ...s }));
    },

    leaderboard: async () => {
      const leaderboardData = await Leaderboard.find()
        .sort({ score: -1 })
        .limit(10)
        .populate('user')
        .lean();
      
      return leaderboardData.map((entry, index) => ({
        id: entry._id.toString(),
        user: entry.user ? { id: (entry.user as any)._id.toString(), ...(entry.user as any) } : null,
        score: entry.score,
        rank: index + 1,
        period: 'all', 
      }));
    },

    monster: async (_: any, { userId }: { userId: string }) => {
      const monsterDoc = await Monster.findOne({ user: userId }).lean();
      if (!monsterDoc) {
        throw new GraphQLError('Monster not found for this user', { extensions: { code: 'NOT_FOUND' } });
      }
      return toGraphQLId(monsterDoc);
    },

    me: async (_: any, __: any, { userId }: { userId?: string }) => {
      if (!userId) {
        throw new GraphQLError('Not authenticated', { extensions: { code: 'UNAUTHENTICATED' } });
      }
      const userDoc = await User.findById(userId).populate('quests').lean();
      if (!userDoc) {
        throw new GraphQLError('User not found', { extensions: { code: 'NOT_FOUND' } });
      }
      return { id: userDoc._id.toString(), ...userDoc };
    },
  },

  Mutation: {
    createUser: async (_: any, { name, email, password }: any) => {
      const trimmedName = name.trim();
      if (trimmedName.length < 2) throw new GraphQLError('Name must be at least 2 characters', { extensions: { code: 'BAD_USER_INPUT' } });
      if (!email.includes('@')) throw new GraphQLError('Invalid email address', { extensions: { code: 'BAD_USER_INPUT' } });
      if (password.length < 6) throw new GraphQLError('Password must be at least 6 characters', { extensions: { code: 'BAD_USER_INPUT' } });
      
      const existing = await User.findOne({ email });
      if (existing) throw new GraphQLError('Email already in use', { extensions: { code: 'BAD_USER_INPUT' } });

      const hashedPassword = await hashPassword(password);
      const user = new User({
        name: trimmedName, email, password: hashedPassword, level: 1, points: 0, isActive: true,
      });
      await user.save();
      
      const monster = new Monster({ user: user._id });
      await monster.save();

      const leaderboardEntry = new Leaderboard({ user: user._id, score: 0 });
      await leaderboardEntry.save();

      return { id: user._id.toString(), ...user.toObject() };
    },

    login: async (_: any, { email, password }: any) => {
      if (!email || !password) throw new GraphQLError('Email and password are required', { extensions: { code: 'BAD_USER_INPUT' } });
      const user = await User.findOne({ email });
      const isValid = user && await comparePassword(password, user.password);
      if (!isValid) throw new GraphQLError('Invalid email or password', { extensions: { code: 'BAD_USER_INPUT' } });
      pubsub.publish('LEADERBOARD_UPDATE', { leaderboardUpdated: true });
      return createToken(user!._id.toString());
    },

    createQuest: async (_: any, { title, description, subject, difficulty, reward }: any, { userId }: any) => {
      if (!userId) throw new GraphQLError('Not authenticated', { extensions: { code: 'UNAUTHENTICATED' } });
      const trimmedTitle = title.trim(), trimmedDescription = description.trim();
      if (trimmedTitle.length < 3 || trimmedTitle.length > 100) throw new GraphQLError('Title must be 3–100 characters', { extensions: { code: 'BAD_USER_INPUT' } });
      if (trimmedDescription.length < 5) throw new GraphQLError('Description is too short', { extensions: { code: 'BAD_USER_INPUT' } });
      if (difficulty < 1 || difficulty > 5) throw new GraphQLError('Difficulty must be between 1 and 5', { extensions: { code: 'BAD_USER_INPUT' } });
      if (reward < 10) throw new GraphQLError('Reward must be at least 10 points', { extensions: { code: 'BAD_USER_INPUT' } });

      const quest = new Quest({ title: trimmedTitle, description: trimmedDescription, subject, difficulty, reward, creator: userId });
      await quest.save();
      await User.findByIdAndUpdate(userId, { $push: { quests: quest._id } });
      const questDoc = await Quest.findById(quest._id).lean();
      return toGraphQLId(questDoc);
    },

    createSubmission: async (_: any, { content, questId, fileUrl }: any, { userId }: any) => {
      if (!userId) throw new GraphQLError('Not authenticated', { extensions: { code: 'UNAUTHENTICATED' } });
      const trimmedContent = content.trim();
      if (trimmedContent.length < 1) throw new GraphQLError('Content cannot be empty', { extensions: { code: 'BAD_USER_INPUT' } });

      const quest = await Quest.findById(questId);
      if (!quest) throw new GraphQLError('Quest not found', { extensions: { code: 'NOT_FOUND' } });

      const submission = new Submission({ content: trimmedContent, quest: questId, author: userId, fileUrl: fileUrl ?? '', grade: 0 });
      await submission.save();
      await updateUserStats(userId, quest.reward);
      await Quest.findByIdAndUpdate(questId, { $push: { submissions: submission._id } });

      const populated: any = await Submission.findById(submission._id).populate('author', 'id name').populate('quest', 'id title').lean();
      const safeSubmission: any = {
        id: populated._id.toString(),
        content: populated.content,
        fileUrl: populated.fileUrl || '',
        grade: populated.grade,
        quest: populated.quest ? { id: populated.quest._id.toString(), title: populated.quest.title } : null,
        author: populated.author ? { id: populated.author._id.toString(), name: populated.author.name } : null
      };

      pubsub.publish(`NEW_SUBMISSION_${questId}`, { newSubmission: safeSubmission });
      pubsub.publish('LEADERBOARD_UPDATE', { leaderboardUpdated: true });
      return safeSubmission;
    },

    gradeSubmission: async (_: any, { submissionId, grade, feedback }: any, { userId }: any) => {
      if (!userId) throw new GraphQLError('Not authenticated', { extensions: { code: 'UNAUTHENTICATED' } });
      if (grade < 0 || grade > 100) throw new GraphQLError('Grade must be between 0 and 100', { extensions: { code: 'BAD_USER_INPUT' } });

      const submission = await Submission.findById(submissionId);
      if (!submission) throw new GraphQLError('Submission not found', { extensions: { code: 'NOT_FOUND' } });

      submission.grade = grade;
      submission.feedback = feedback || '';
      await submission.save();

      const populated: any = await Submission.findById(submissionId).populate('author', 'id name').populate('quest', 'id title').lean();
      if (populated.author) {
        await updateUserStats(populated.author._id.toString(), grade * 10);
      }

      pubsub.publish('LEADERBOARD_UPDATE', { leaderboardUpdated: true });

      return {
        id: populated._id.toString(),
        content: populated.content,
        grade: populated.grade,
        feedback: populated.feedback,
        author: populated.author || null,
        quest: populated.quest || null,
      };
    },

    updateQuest: async (_: any, { id, title, description }: any, { userId }: any) => {
      if (!userId) throw new GraphQLError('Not authenticated', { extensions: { code: 'UNAUTHENTICATED' } });
      const trimmedTitle = title.trim(), trimmedDescription = description.trim();
      if (trimmedTitle.length < 3 || trimmedTitle.length > 100) throw new GraphQLError('Title must be 3–100 characters');
      if (trimmedDescription.length < 5) throw new GraphQLError('Description is too short');

      const quest = await Quest.findOneAndUpdate({ _id: id, creator: userId }, { title: trimmedTitle, description: trimmedDescription }, { new: true }).lean();
      if (!quest) throw new GraphQLError('Quest not found');
      return { id: quest._id.toString(), ...quest };
    },

    deleteSubmission: async (_: any, { id }: any, { userId }: any) => {
      if (!userId) throw new GraphQLError('Not authenticated');
      const result = await Submission.findOneAndDelete({ _id: id, author: userId });
      if (!result) throw new GraphQLError('Submission not found');
      return true;
    },
  },

  Subscription: {
  newSubmission: {
    subscribe: (parent: any, { questId }: any) => {
      return pubsub.asyncIterableIterator(`NEW_SUBMISSION_${questId}`);
    },
    resolve: (payload: any) => payload.newSubmission,
  },
  leaderboardUpdated: {
    // @ts-ignore
    subscribe: () => pubsub.asyncIterableIterator('LEADERBOARD_UPDATE'),
    resolve: () => true, // триггер для refetch
  },
},


  User: {
    monster: async (user: any) => {
      const monsterDoc = await Monster.findOne({ user: user._id }).lean();
      return monsterDoc ? toGraphQLId(monsterDoc) : null;
    },
  },
};
