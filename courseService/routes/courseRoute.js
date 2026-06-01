const express = require("express");
const Course = require("../models/course");
const router = express.Router();
const { verifyRole } = require("./auth/util");
const { ROLES } = require("../../consts");

// Create a new course
//TODO: also add more restrictions to course
// Only the professor who created the course can edit it or delete it etc or has access to it
router.post(
  "/",
  verifyRole([ROLES.ADMIN, ROLES.PROFESSOR]),
  async (req, res) => {
    try {
      req.body.createdBy = req.user.id;
      const course = new Course(req.body);
      await course.save();
      res.status(201).json(course);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  }
);

// Get all courses
router.get(
  "/",
  verifyRole([ROLES.ADMIN, ROLES.PROFESSOR, ROLES.ENROLLMENT_SERVICE]),
  async (req, res) => {
    try {
      const courses = await Course.find();
      res.status(200).json(courses);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

// Get a single course by ID
router.get(
  "/:id",
  verifyRole([ROLES.ADMIN, ROLES.PROFESSOR, ROLES.ENROLLMENT_SERVICE, ROLES.GRADE_SERVICE]),
  async (req, res) => {
    try {
      const course = await Course.findById(req.params.id);
      if (!course) {
        return res.status(404).json({ message: "Course not found" });
      }
      res.status(200).json(course);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

// Update a course by ID
router.put(
  "/:id",
  verifyRole([ROLES.ADMIN, ROLES.PROFESSOR]),
  async (req, res) => {
    try {
      const course = await Course.findById(req.params.id);
      if (!course) {
        return res.status(404).json({ message: "Course not found" });
      }

      // If professor, ensure they created the course
      if (
        req.user.roles.includes(ROLES.PROFESSOR) &&
        course.createdBy !== req.user.id
      ) {
        return res
          .status(403)
          .json({ message: "Access forbidden: You did not create this course" });
      }

      // Remove the `createdBy` field from the request body to prevent transfer
      if ("createdBy" in req.body) {
        delete req.body.createdBy;
      }

      const updatedCourse = await Course.findByIdAndUpdate(
        req.params.id,
        req.body,
        {
          new: true,
          runValidators: true,
        }
      );
      res.status(200).json(updatedCourse);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  }
);

// DELETE a course by ID
router.delete(
  "/:id",
  verifyRole([ROLES.ADMIN, ROLES.PROFESSOR]),
  async (req, res) => {
    try {
      const courseId = req.params.id;
      const course = await Course.findById(courseId);

      if (!course) {
        return res.status(404).json({ message: "Course not found" });
      }

      // If professor, ensure they created the course
      if (
        req.user.roles.includes(ROLES.PROFESSOR) &&
        course.createdBy !== req.user.id
      ) {
        return res
          .status(403)
          .json({ message: "Access forbidden: You did not create this course" });
      }

      await Course.findByIdAndDelete(courseId);
      res.status(200).json({ message: "Course deleted successfully", course });
    } catch (error) {
      console.error(error);
      if (error.kind === "ObjectId") {
        return res.status(400).json({ message: "Invalid course ID format" });
      }
      res
        .status(500)
        .json({ message: "Server Error: Unable to delete course" });
    }
  }
);

module.exports = router;
