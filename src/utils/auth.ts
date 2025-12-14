import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

const JWT_SECRET = 'MySuperSecretKey123!@#';  // ✅ ФИНАЛЬНЫЙ секрет!

export const createToken = (userId: string) => {
  console.log('🔑 CREATE TOKEN → userId:', userId);
  console.log('🔑 CREATE SECRET:', JWT_SECRET);
  const token = jwt.sign({ userId }, JWT_SECRET, { expiresIn: '7d' });
  console.log('🔑 TOKEN CREATED:', token.slice(0, 20) + '...');
  return token;
};

export const verifyToken = (token: string) => {
  console.log('🔑 VERIFY TOKEN:', token.slice(0, 20) + '...');
  console.log('🔑 VERIFY SECRET:', JWT_SECRET);
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };
    console.log('✅ DECODED OK:', decoded.userId);
    return decoded;
  } catch (error: any) {
    console.log('❌ JWT ERROR:', error.message);
    throw new Error('Invalid token');
  }
};

export const hashPassword = async (password: string) => {
  return bcrypt.hash(password, 12);
};

export const comparePassword = async (password: string, hash: string) => {
  return bcrypt.compare(password, hash);
};
