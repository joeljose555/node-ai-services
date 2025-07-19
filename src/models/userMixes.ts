import mongoose from 'mongoose';

const userMixesSchema = new mongoose.Schema({
    userId: {
        type: String,
        required: true,
    },
    audioUrl: {
        type: String,
        required: true,
    },
    mixName: {
        type: String,
        required: true,
    },
    mixIcon: {
        type: String
    },
    mixType: {
        type: String,
        enum:['morning','afternoon','evening','night'],
        default:'morning'
    }
},{
    timestamps: true,
    versionKey: false,
});

export default mongoose.model('UserMixes', userMixesSchema);