import mongoose from 'mongoose';

const aiSummariesSchema = new mongoose.Schema({
    userId: {
        type: String,
        required: true,
    },
    summary: {
        type: String,
        required: true,
    },
    summaryType: {
        type: String,
        required: true,
        enum: ['user', 'category'],
        default: 'user',
    },
    summaryTitle: {
        type: String,
        required: true,
        default: 'Daily Mix',
    },
    batchId: {
        type: String,
        required: false,
        index: true
    },
    isAudioGenerated: {
        type: Boolean,
        required: true,
        default: false,
        index: true
    },
    audioUrl: {
        type: String,
        required: false
    },
},{
    timestamps: true,
    versionKey: false,
});

export default mongoose.model('AiSummaries', aiSummariesSchema);