import mongoose, { Document, Schema } from 'mongoose';

export interface IAudioGenerationRetry extends Document {
    batchId: string;
    retryCount: number;
    maxRetries: number;
    status: 'pending' | 'retrying' | 'success' | 'failed';
    lastError?: string;
    lastAttemptAt: Date;
    nextRetryAt?: Date;
    createdAt: Date;
    successAt?: Date;
    finalFailureAt?: Date;
    summaryData: any; // The data that was sent to audio generation
}

const audioGenerationRetrySchema = new Schema<IAudioGenerationRetry>({
    batchId: {
        type: String,
        required: true,
        index: true
    },
    retryCount: {
        type: Number,
        required: true,
        default: 0,
        min: 0
    },
    maxRetries: {
        type: Number,
        required: true,
        default: 3 // Default to 3 retries
    },
    status: {
        type: String,
        enum: ['pending', 'retrying', 'success', 'failed'],
        default: 'pending',
        required: true
    },
    lastError: {
        type: String
    },
    lastAttemptAt: {
        type: Date,
        required: true,
        default: Date.now
    },
    nextRetryAt: {
        type: Date,
        index: true // For efficient retry scheduling queries
    },
    createdAt: {
        type: Date,
        default: Date.now,
        required: true
    },
    successAt: {
        type: Date
    },
    finalFailureAt: {
        type: Date
    },
    summaryData: {
        type: Schema.Types.Mixed,
        required: true
    }
}, {
    timestamps: true,
    collection: 'audio_generation_retries'
});

// Index for efficient retry queries
audioGenerationRetrySchema.index({ status: 1, nextRetryAt: 1 });
audioGenerationRetrySchema.index({ batchId: 1, status: 1 });

export default mongoose.model<IAudioGenerationRetry>('AudioGenerationRetry', audioGenerationRetrySchema); 