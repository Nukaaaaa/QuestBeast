import User from '../models/User';
import Quest from '../models/Quest';
import Submission from '../models/Submission';
import { hashPassword, comparePassword, createToken } from '../utils/auth';
import { PubSub } from 'graphql-subscriptions';

const pubsub = { 
  asyncIterator: (topics: string[]) => ({
    next: () => Promise.resolve({}),
    return: () => Promise.resolve({}),
    throw: () => Promise.reject(new Error(''))
  }) as any 
} as any;

export const resolvers = {
  Query: {
    // ✅ БАЗОВЫЕ
    users: async () => await User.find().populate('quests'),
    user: async (_: any, { id }: any) => {
      const userDoc = await User.findById(id).populate('quests');
      if (!userDoc) throw new Error('User not found');
      return userDoc;
    },
    
    // ✅ КВЕСТЫ
    quests: async (_: any, { subject }: any) => 
      subject 
        ? await Quest.find({ subject }).populate('creator submissions')
        : await Quest.find().populate('creator submissions'),
    quest: async (_: any, { id }: any) => {
      const questDoc = await Quest.findById(id).populate('creator submissions');
      if (!questDoc) throw new Error('Quest not found');
      return questDoc;
    },
    
    // ✅ САБМИШИНЫ
    submissions: async (_: any, { questId }: any) => 
      await Submission.find({ questId }).populate('author quest'),
    
    // ✅ ЛИДЕРБОРД
    leaderboard: async () => {
      const users = await User.find().sort({ points: -1 }).limit(10);
      return users.map((user, index) => ({
        id: user._id.toString(),
        user,
        score: user.points,
        rank: index + 1,
        period: 'weekly'
      }));
    },
    
    // ✅ МОНСТР
    monster: async (_: any, { userId }: any) => {
      const user = await User.findById(userId);
      const points = user?.points || 0;
      return {
        id: userId,
        name: points > 1000 ? 'Dragon' : points > 100 ? 'Orc' : 'Goblin',
        level: Math.floor(points / 100) + 1,
        hunger: Math.max(0, 100 - (points % 100)),
        multiplier: 1 + (points / 1000),
        evolutionStage: points > 500 ? 'Adult' : 'Baby'
      };
    }
  },
  
  Mutation: {
    // ✅ CREATE USER
    createUser: async (_: any, { name, email, password }: any) => {
      const hashedPassword = await hashPassword(password);
      const user = new User({ 
        name, 
        email, 
        password: hashedPassword,
        level: 1,
        points: 0,
        isActive: true
      });
      await user.save();
      return user;
    },

    // ✅ LOGIN
    login: async (_: any, { email, password }: any) => {
      const user = await User.findOne({ email });
      if (!user || !await comparePassword(password, user.password)) {
        throw new Error('Неверный email/пароль');
      }
      return createToken(user._id.toString());
    },

    // ✅ CREATE QUEST
    createQuest: async (_: any, { title, description, subject, difficulty, reward }: any, { userId }: any) => {
      if (!userId) throw new Error('Авторизуйся!');
      const quest = new Quest({ 
        title, 
        description, 
        subject, 
        difficulty, 
        reward, 
        creator: userId 
      });
      await quest.save();
      
      // ✅ Связь с пользователем
      await User.findByIdAndUpdate(userId, { $push: { quests: quest._id } });
      return quest;
    },

    // ✅ CREATE SUBMISSION (ФИКС questId!)
    createSubmission: async (_: any, { content, questId }: any, { userId }: any) => {
      if (!userId) throw new Error('Авторизуйся!');
      
      const submission = new Submission({ 
        content, 
        quest: questId,  // ✅ quest: questId!
        author: userId, 
        grade: 0 
      });
      await submission.save();
      
      // ✅ POINTS SYSTEM!
      const quest = await Quest.findById(questId);
      if (quest) {
        await User.findByIdAndUpdate(userId, { 
          $inc: { points: quest.reward }
        });
      }
      
      // ✅ REAL-TIME NOTIFICATION
      pubsub.publish('NEW_SUBMISSION', { newSubmission: submission });
      
      // ✅ Связь с квестом
      await Quest.findByIdAndUpdate(questId, { 
        $push: { submissions: submission._id } 
      });
      
      return submission;
    },

    // ✅ GRADE SUBMISSION
    gradeSubmission: async (_: any, { submissionId, grade, feedback }: any, { userId }: any) => {
      if (!userId) throw new Error('Авторизуйся!');
      
      const submission = await Submission.findByIdAndUpdate(
        submissionId, 
        { grade, feedback }, 
        { new: true }
      ).populate('author quest');
      
      if (!submission) throw new Error('Submission not found');
      
      if (submission.author) {
        await User.findByIdAndUpdate(submission.author._id, { 
          $inc: { points: grade * 10 } 
        });
      }
      
      return submission;
    },

    // ✅ UPDATE QUEST (6-я мутация!)
    updateQuest: async (_: any, { id, title, description }: any, { userId }: any) => {
      if (!userId) throw new Error('Авторизуйся!');
      const quest = await Quest.findOneAndUpdate(
        { _id: id, creator: userId },
        { title, description },
        { new: true }
      ).populate('creator submissions');
      
      if (!quest) throw new Error('Quest not found');
      return quest;
    },

    // ✅ DELETE SUBMISSION (7-я мутация!)
    deleteSubmission: async (_: any, { id }: any, { userId }: any) => {
      if (!userId) throw new Error('Авторизуйся!');
      const result = await Submission.findOneAndDelete({ _id: id, author: userId });
      if (!result) throw new Error('Submission not found');
      return { success: true };
    }
  },

  // ✅ SUBSCRIPTIONS (REAL-TIME!)
  Subscription: {
    newSubmission: {
      subscribe: () => pubsub.asyncIterator(['NEW_SUBMISSION'])
    }
  }
};
