import mongoose from 'mongoose';

const newsSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true
    },
    description: {
        type: String,
        required: false
    },
    fullText:{
        type: String,
    },
    publishedAt:{
        type: Date,
        required: true
    },
    url:{
        type: String,
        required: true
    },
    categoryId:{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Category'
    },
    categoryName:{
        type: String,
        required: false
    },
    source: {
        type: String,
        required: false
    }
}, {
    timestamps: true
})

export default mongoose.model('NewsArticle', newsSchema);