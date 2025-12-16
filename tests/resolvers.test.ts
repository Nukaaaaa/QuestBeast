import { resolvers } from '@/resolvers';
import User from '@/models/User';
import Quest from '@/models/Quest';
import Submission from '@/models/Submission';
import Monster from '@/models/Monster';
import Leaderboard from '@/models/LeadBoard';
import { hashPassword, comparePassword, createToken } from '@/utils/auth';

jest.mock('@/models/User');
jest.mock('@/models/Quest');
jest.mock('@/models/Submission');
jest.mock('@/models/Monster');
jest.mock('@/models/LeadBoard');
jest.mock('@/utils/auth');
jest.mock('@/pubsub');

describe('Resolvers Unit Tests', () => {
  beforeEach(() => jest.clearAllMocks());

  // Test 1
  it('users - возвращает список пользователей', async () => {
    const mockUsers = [{ _id: '1', name: 'Alice', points: 100 }];
    (User.find as jest.Mock).mockReturnValue({
      populate: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue(mockUsers)
      })
    });

    const result = await resolvers.Query.users();
    
    expect(result[0].id).toBe('1');
    expect(result[0].name).toBe('Alice');
  });

  // Test 2
  it('user - выбрасывает ошибку если не найден', async () => {
    (User.findById as jest.Mock).mockReturnValue({
      populate: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue(null)
      })
    });

    await expect(resolvers.Query.user(null, { id: '999' }))
      .rejects.toThrow('User not found');
  });

  // Test 3
  it('quests - фильтрует по subject', async () => {
    (Quest.find as jest.Mock).mockReturnValue({
      populate: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([])
      })
    });

    await resolvers.Query.quests(null, { subject: 'Math' });
    
    expect(Quest.find).toHaveBeenCalledWith({ subject: 'Math' });
  });

  // Test 4
  it('monster - возвращает монстра из БД', async () => {
    const mockMonster = { _id: 'm1', name: 'TestBeast', level: 5 };
    (Monster.findOne as jest.Mock).mockReturnValue({
      lean: jest.fn().mockResolvedValue(mockMonster)
    });

    const result = await resolvers.Query.monster(null, { userId: '1' });
    
    expect(Monster.findOne).toHaveBeenCalledWith({ user: '1' });
    expect(result.name).toBe('TestBeast');
    expect(result.level).toBe(5);
  });

  // Test 5
  it('monster - выбрасывает ошибку если монстр не найден', async () => {
    (Monster.findOne as jest.Mock).mockReturnValue({
      lean: jest.fn().mockResolvedValue(null)
    });

    await expect(resolvers.Query.monster(null, { userId: '1' }))
      .rejects.toThrow('Monster not found for this user');
  });

  // Test 6
  it('me - требует аутентификации', async () => {
    await expect(resolvers.Query.me(null, {}, {}))
      .rejects.toThrow('Not authenticated');
  });

  // Test 7
  it('createUser - валидирует короткое имя', async () => {
    await expect(resolvers.Mutation.createUser(null, { 
      name: 'A', email: 'a@test.com', password: '123456' 
    })).rejects.toThrow('Name must be at least 2 characters');
  });

  // Test 8
  it('createUser - валидирует email', async () => {
    await expect(resolvers.Mutation.createUser(null, { 
      name: 'Alice', email: 'invalid', password: '123456' 
    })).rejects.toThrow('Invalid email address');
  });

  // Test 9
  it('login - возвращает токен при валидных данных', async () => {
    (User.findOne as jest.Mock).mockResolvedValue({ 
      _id: '1', password: 'hash' 
    });
    (comparePassword as jest.Mock).mockResolvedValue(true);
    (createToken as jest.Mock).mockReturnValue('token123');

    const result = await resolvers.Mutation.login(null, { 
      email: 'a@test.com', password: 'pass' 
    });
    
    expect(result).toBe('token123');
  });

  // Test 10
  it('createQuest - требует аутентификации', async () => {
    await expect(resolvers.Mutation.createQuest(null, {
      title: 'Test', description: 'Desc', subject: 'Math', 
      difficulty: 3, reward: 50
    }, {})).rejects.toThrow('Not authenticated');
  });
});