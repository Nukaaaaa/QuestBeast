import 'dotenv/config';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

import User from './models/User';
import Monster from './models/Monster';
import Quest from './models/Quest';
import LeadBoard from './models/LeadBoard';
import Submission from './models/Submission';

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI!);
    console.log('✅ MongoDB подключён для сидинга');
  } catch (err) {
    console.error('❌ Ошибка подключения к MongoDB для сидинга:', err);
    process.exit(1);
  }
};

const clearDatabase = async () => {
  console.log('🗑️ Очистка базы данных...');
  await User.deleteMany({});
  await Monster.deleteMany({});
  await Quest.deleteMany({});
  await LeadBoard.deleteMany({});
  await Submission.deleteMany({});
  console.log('🗑️ База данных очищена.');
};

const seedDatabase = async () => {
  await connectDB();
  await clearDatabase();

  console.log('🌱 Заполнение базы данных СТУДЕНЧЕСКИМИ данными...');

  const hashedPassword1 = await bcrypt.hash('123456', 10);
  const hashedPassword2 = await bcrypt.hash('123456', 10);

  const users = await User.insertMany([
    {
      name: 'Arsen Orynbas',
      email: 'kazaktars123@gmail.com',
      password: hashedPassword1,
      level: 1,
      points: 0,
    },
    {
      name: 'Nurtilek',
      email: 'nuka123@gmail.com',
      password: hashedPassword2,
      level: 1,
      points: 0,
    },
  ]);
  const [arsen, nuka] = users;
  console.log(`👨‍🎓 Добавлено ${users.length} студентов.`);

  const monsters = await Monster.insertMany([
    {
      name: 'Математический Дракон',
      user: arsen._id,
      level: 1,
      hunger: 100,
      multiplier: 1,
      evolutionStage: 'baby',
    },
    {
      name: 'Исторический Гремлин',
      user: nuka._id,
      level: 1,
      hunger: 100,
      multiplier: 1,
      evolutionStage: 'baby',
    },
  ]);
  console.log(`🐲 Добавлено ${monsters.length} монстров.`);

  const quests = await Quest.insertMany([
    {
      title: 'Решить систему уравнений 3x+2y=12',
      description: 'Найти все решения системы: 3x+2y=12, x-y=1.',
      subject: 'Математика',
      difficulty: 3,
      reward: 200,
      creator: arsen._id,
    },
    {
      title: 'Эссе: Сталинградская битва 1942-1943',
      description: 'Опишите ключевые события Сталинградской битвы. Минимум 500 слов + источники.',
      subject: 'История',
      difficulty: 4,
      reward: 350,
      creator: nuka._id,
    },
    {
      title: 'Создать React TodoList компонент',
      description: 'Стилизовать на TailwindCSS. Добавить CRUD операции + Zustand состояние.',
      subject: 'Программирование',
      difficulty: 5,
      reward: 500,
      creator: arsen._id,
    },
  ]);
  const [mathQuest, historyQuest, reactQuest] = quests;
  console.log(`📚 Добавлено ${quests.length} реальных заданий.`);

  const leaderboardEntries = await LeadBoard.insertMany([
    {
      user: arsen._id,
      score: arsen.points,
      rank: 1,
      period: 'all',
    },
    {
      user: nuka._id,
      score: nuka.points,
      rank: 2,
      period: 'all',
    },
  ]);
  console.log(`🏆 Добавлено ${leaderboardEntries.length} записей лидерборда.`);

  console.log('🎓 ✅ База СТУДЕНЧЕСКИХ данных заполнена!');
  console.log('🔑 Тестовые логины:');
  console.log('👤 kazaktars123@gmail.com / 123456');
  console.log('👤 nuka123@gmail.com / 123456');
  
  await mongoose.disconnect();
  console.log('🔌 MongoDB отключён.');
};

seedDatabase().catch((err) => {
  console.error('❌ Ошибка при заполнении базы данных:', err);
  process.exit(1);
});
