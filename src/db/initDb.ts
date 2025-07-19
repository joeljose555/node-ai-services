import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { logSuccess, logError } from '../utils/logger';
dotenv.config();

export const connectDb = async (): Promise<void> => {
  try {
    await mongoose.connect(process.env.MONGO_URI || '', {
      // useNewUrlParser and useUnifiedTopology are default in mongoose >= 6
    });
    logSuccess('🗄️  MongoDB connected successfully');
  } catch (error) {
    logError('❌ MongoDB connection error:', error);
    process.exit(1);
  }
};
