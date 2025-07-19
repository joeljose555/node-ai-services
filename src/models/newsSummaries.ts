import mongoose from 'mongoose';

const newsSummariesSchema = new mongoose.Schema({
    summary: {
        type: String,
        required: true
    },
    userId: {
        type: String,
        required: false
    },
    summaryType: {
        type: String,
        required: false,
        enum: ['general', 'user']
    },
    categoryId: {
        type: mongoose.Schema.Types.ObjectId,
        required: false
    },
    summaryTitle: {
        type: String,
        required: false
    },
    articleCount: {
        type: Number,
        required: true
    }
}, { timestamps: true });

export default mongoose.model('NewsSummaries', newsSummariesSchema);