import mongoose from "mongoose";

const userCategoryPreferenceSchema = new mongoose.Schema({
    userId: {
        type: String,
        ref: "User",
        required: true,
    },
    preferredCategories: [
        {
            categoryID:{
                type: mongoose.Schema.Types.ObjectId,
                ref: "Category",
                required: true,
            },
            categoryName:{
                type: String,
                required: true,
            }
        }
    ]
},{
    timestamps: true,
});

const UserCategoryPreference = mongoose.model("UserCategoryPreference", userCategoryPreferenceSchema);

export default UserCategoryPreference;