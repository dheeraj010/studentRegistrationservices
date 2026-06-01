const mongoose = require("mongoose");

// Define the Grade Schema
const gradeSchema = new mongoose.Schema({
  student: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    ref: "Student",
  },
  course: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    ref: "Course",
  },
  enrollment: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    ref: "Enrollment",
  },
  grade: {
    type: String,
    required: true,
    enum: ["A+", "A", "A-", "B+", "B", "B-", "C+", "C", "C-", "D+", "D", "D-", "F"],
  },
  score: {
    type: Number,
    min: 0,
    max: 100,
  },
  remarks: {
    type: String,
  },
  gradedBy: {
    type: String,
    required: true,
  },
  gradedAt: {
    type: Date,
    default: Date.now,
  },
});

// Ensure a student can only have one grade per course
gradeSchema.index({ student: 1, course: 1 }, { unique: true });

const Grade = mongoose.model("Grade", gradeSchema);

module.exports = Grade;
