import mongoose, { Document, Schema } from 'mongoose';

export interface IBatchTracker extends Document {
    batchId: string;
    expectedCount: number;
    receivedCount: number;
    status: 'pending' | 'partial_complete' | 'complete' | 'audio_requested' | 'audio_complete' | 'audio_failed' | 'failed';
    createdAt: Date;
    partialCompletedAt?: Date;
    completedAt?: Date;
    audioRequestedAt?: Date;
    audioCompletedAt?: Date;
    audioFailedAt?: Date;
    timeoutAt: Date; // 30 minutes from creation
    userIds: string[]; // Track which users are part of this batch
    audioUrl?: string; // Store audio URL when generation is complete
    failureReason?: string; // Store failure reason if audio generation fails
}

const batchTrackerSchema = new Schema<IBatchTracker>({
    batchId: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    expectedCount: {
        type: Number,
        required: true,
        min: 1
    },
    receivedCount: {
        type: Number,
        required: true,
        default: 0,
        min: 0
    },
    status: {
        type: String,
        enum: ['pending', 'partial_complete', 'complete', 'audio_requested', 'audio_complete', 'audio_failed', 'failed'],
        default: 'pending',
        required: true
    },
    createdAt: {
        type: Date,
        default: Date.now,
        required: true
    },
    partialCompletedAt: {
        type: Date
    },
    completedAt: {
        type: Date
    },
    audioRequestedAt: {
        type: Date
    },
    audioCompletedAt: {
        type: Date
    },
    audioFailedAt: {
        type: Date
    },
    timeoutAt: {
        type: Date,
        required: true,
        index: true // For efficient timeout queries
    },
    userIds: {
        type: [String],
        required: true,
        default: []
    },
    audioUrl: {
        type: String,
        required: false
    },
    failureReason: {
        type: String,
        required: false
    }
}, {
    timestamps: true,
    collection: 'batch_trackers'
});

// Index for efficient status and timeout queries
batchTrackerSchema.index({ status: 1, timeoutAt: 1 });
batchTrackerSchema.index({ status: 1, createdAt: 1 });

export default mongoose.model<IBatchTracker>('BatchTracker', batchTrackerSchema); 