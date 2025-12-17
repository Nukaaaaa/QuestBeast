import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { resolvers } from '@/resolvers';
import User from '@/models/User';
import Quest from '@/models/Quest';
import Submission from '@/models/Submission';

describe('Integration Test', () => {
  let mongoServer: MongoMemoryServer;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    await User.deleteMany({});
    await Quest.deleteMany({});
    await Submission.deleteMany({});
  });

  it('полный флоу: создание пользователя → квест → submission → оценка', async () => {
    const user = await resolvers.Mutation.createUser(null, {
      name: 'Alice',
      email: 'alice@test.com',
      password: 'password123'
    });
    expect(user.points).toBe(0);

    const quest = await resolvers.Mutation.createQuest(null, {
      title: 'Math Quest',
      description: 'Solve problems',
      subject: 'Math',
      difficulty: 3,
      reward: 100
    }, { userId: user.id });
    expect(quest.reward).toBe(100);

    const submission = await resolvers.Mutation.createSubmission(null, {
      content: 'My solutions here',
      questId: quest.id,
      fileUrl: ''
    }, { userId: user.id });
    expect(submission.grade).toBe(0);

    let updatedUser = await User.findById(user.id);
    expect(updatedUser?.points).toBe(100);

    await resolvers.Mutation.gradeSubmission(null, {
      submissionId: submission.id,
      grade: 80,
      feedback: 'Good job!'
    }, { userId: user.id });

    updatedUser = await User.findById(user.id);
    expect(updatedUser?.points).toBe(900);

    const leaderboard = await resolvers.Query.leaderboard();
    expect(leaderboard[0].score).toBe(900);
    expect(leaderboard[0].rank).toBe(1);

    const monster = await resolvers.Query.monster(null, { userId: user.id });
    expect(monster.name).toBe('Orc'); 
    expect(monster.level).toBe(10); 
    expect(monster.evolutionStage).toBe('adult');
  });
});