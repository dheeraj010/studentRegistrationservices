const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

// Define the Student Schema

const studentSchema = new mongoose.Schema({
    name:{
        type: String,
        required: true,
        trim: true
    },
    email:{
        type: String,
        required: true,
        unique: true,
        lowercase: true
    },
    password:{
        type: String,
        required: true,
        minlength: 6
    },
    courses: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: "Course"
    }]
},);                                          

studentSchema.pre("save", async function (next){
    if(!this.isModified("password"))   return next();
    try{
        const salt = await bcrypt.genSalt(10);
        const hashedpassword = await bcrypt.hash(this.password,salt);
            this.password=hashedpassword;
    }
    catch(error){
        next(error);
    }
}

)
// Create the Student model
const Student = mongoose.model("Student", studentSchema);

module.exports = Student;
