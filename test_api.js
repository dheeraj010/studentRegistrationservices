const assert = require("assert");

const AUTH_URL = "http://localhost:5001/api/login";
const STUDENT_URL = "http://localhost:5003/api/students";
const PROFESSOR_URL = "http://localhost:5002/api/professors";
const COURSE_URL = "http://localhost:5004/api/courses";
const ENROLLMENT_URL = "http://localhost:5005/api/enrollments";
const GRADE_URL = "http://localhost:5006/api/grades";

async function runTests() {
  console.log("=== Starting End-to-End API Tests ===");

  const CORRELATION_ID = `test-${Date.now()}`;
  function withCorr(headers = {}) { return { ...headers, "x-correlation-id": CORRELATION_ID }; }

  const timestamp = Date.now();
  const studentEmail = `student_${timestamp}@test.com`;
  const professorEmail = `professor_${timestamp}@test.com`;
  const studentPassword = "password123";
  const professorPassword = "password123";
  const adminPassword = "admin"; // match authService .env

  let studentId, professorId, courseId, enrollmentId;
  let studentToken, professorToken, adminToken;

  // 1. Create a Student (Public)
  console.log("\n1. Registering new student...");
  const createStudentRes = await fetch(STUDENT_URL, {
    method: "POST",
    headers: withCorr({ "Content-Type": "application/json" }),
    body: JSON.stringify({
      name: "John Doe Test",
      email: studentEmail,
      password: studentPassword,
    }),
  });
  assert.strictEqual(createStudentRes.status, 201, "Student registration failed");
  const studentData = await createStudentRes.json();
  studentId = studentData._id;
  console.log(`✓ Student registered with ID: ${studentId}`);

  // 2. Create a Professor (Public)
  console.log("\n2. Registering new professor...");
  const createProfessorRes = await fetch(PROFESSOR_URL, {
    method: "POST",
    headers: withCorr({ "Content-Type": "application/json" }),
    body: JSON.stringify({
      name: "Prof. Einstein Test",
      email: professorEmail,
      phone: `123-456-${timestamp.toString().slice(-4)}`,
      password: professorPassword,
    }),
  });
  assert.strictEqual(createProfessorRes.status, 201, "Professor registration failed");
  const professorData = await createProfessorRes.json();
  professorId = professorData._id;
  console.log(`✓ Professor registered with ID: ${professorId}`);

  // 3. Login Student
  console.log("\n3. Logging in as student...");
  const studentLoginRes = await fetch(`${AUTH_URL}/student`, {
    method: "POST",
    headers: withCorr({ "Content-Type": "application/json" }),
    body: JSON.stringify({ email: studentEmail, password: studentPassword }),
  });
  assert.strictEqual(studentLoginRes.status, 201, "Student login failed");
  const studentLoginData = await studentLoginRes.json();
  studentToken = studentLoginData.access_token;
  console.log("✓ Student logged in, JWT obtained");

  // 4. Login Professor
  console.log("\n4. Logging in as professor...");
  const professorLoginRes = await fetch(`${AUTH_URL}/professor`, {
    method: "POST",
    headers: withCorr({ "Content-Type": "application/json" }),
    body: JSON.stringify({ email: professorEmail, password: professorPassword }),
  });
  assert.strictEqual(professorLoginRes.status, 200, "Professor login failed");
  const professorLoginData = await professorLoginRes.json();
  professorToken = professorLoginData.access_token;
  console.log("✓ Professor logged in, JWT obtained");

  // 5. Login Admin
  console.log("\n5. Logging in as admin...");
  const adminLoginRes = await fetch(`${AUTH_URL}/admin`, {
    method: "POST",
    headers: withCorr({ "Content-Type": "application/json" }),
    body: JSON.stringify({ email: "admin@gmail.com", password: adminPassword }),
  });
  assert.strictEqual(adminLoginRes.status, 200, "Admin login failed");
  const adminLoginData = await adminLoginRes.json();
  adminToken = adminLoginData.access_token;
  console.log("✓ Admin logged in, JWT obtained");

  // 6. Create Course (as Professor)
  console.log("\n6. Creating course as professor...");
  const createCourseRes = await fetch(COURSE_URL, {
    method: "POST",
    headers: {
      ...withCorr({ "Content-Type": "application/json" }),
      Authorization: `Bearer ${professorToken}`,
    },
    body: JSON.stringify({
      name: "Introduction to Physics",
      code: `PHYS_${timestamp}`,
      description: "A course about classical mechanics.",
      schedule: {
        days: ["Monday", "Wednesday"],
        time: "10:00 AM - 12:00 PM",
      },
    }),
  });
  if (createCourseRes.status !== 201) {
    const errText = await createCourseRes.text();
    console.error('Course creation failed response body:', errText);
  }
  assert.strictEqual(createCourseRes.status, 201, "Course creation failed");
  const courseDataObj = await createCourseRes.json();
  courseId = courseDataObj._id;
  console.log(`✓ Course created with ID: ${courseId}`);

  // 7. Create Course (as Student - should fail)
  console.log("\n7. Trying to create course as student (should fail with 403)...");
  const createCourseFailRes = await fetch(COURSE_URL, {
    method: "POST",
    headers: {
      ...withCorr({ "Content-Type": "application/json" }),
      Authorization: `Bearer ${studentToken}`,
    },
    body: JSON.stringify({
      name: "Cheating 101",
      code: `CHEAT_${timestamp}`,
      description: "Should fail.",
      schedule: { days: ["Friday"], time: "9:00 AM" },
    }),
  });
  assert.strictEqual(createCourseFailRes.status, 403, "Student should not be allowed to create a course");
  console.log("✓ Correctly rejected with 403 Forbidden");

  // 8. Enroll Student in Course (as Professor)
  console.log("\n8. Enrolling student in course as professor...");
  const enrollRes = await fetch(ENROLLMENT_URL, {
    method: "POST",
    headers: {
      ...withCorr({ "Content-Type": "application/json" }),
      Authorization: `Bearer ${professorToken}`,
    },
    body: JSON.stringify({ student: studentId, course: courseId }),
  });
  assert.strictEqual(enrollRes.status, 201, "Enrollment creation failed");
  const enrollmentDataObj = await enrollRes.json();
  enrollmentId = enrollmentDataObj._id;
  console.log(`✓ Enrollment created with ID: ${enrollmentId}`);

  // 9. Fetch Student's Enrollments (as Student themselves)
  console.log("\n9. Fetching student enrollments as the student themselves...");
  const getEnrollmentsRes = await fetch(`${ENROLLMENT_URL}/student/${studentId}`, {
    method: "GET",
    headers: withCorr({ Authorization: `Bearer ${studentToken}` }),
  });
  assert.strictEqual(getEnrollmentsRes.status, 200, "Failed to get student enrollments");
  const enrollmentsList = await getEnrollmentsRes.json();
  assert.ok(enrollmentsList.length > 0, "Enrollments list is empty");
  assert.strictEqual(enrollmentsList[0].course.name, "Introduction to Physics", "Course name in enrollment is incorrect");
  console.log("✓ Student successfully retrieved their own enrollment with course details populated!");

  // 10. Fetch Student's Enrollments (as another student - should fail)
  console.log("\n10. Trying to fetch student enrollments as a different student (should fail with 403)...");
  // Let's sign up a second student
  const createStudent2Res = await fetch(STUDENT_URL, {
    method: "POST",
    headers: withCorr({ "Content-Type": "application/json" }),
    body: JSON.stringify({
      name: "Alice Smith",
      email: `alice_${timestamp}@test.com`,
      password: studentPassword,
    }),
  });
  const student2Data = await createStudent2Res.json();
  const student2Id = student2Data._id;

  const student2LoginRes = await fetch(`${AUTH_URL}/student`, {
    method: "POST",
    headers: withCorr({ "Content-Type": "application/json" }),
    body: JSON.stringify({ email: `alice_${timestamp}@test.com`, password: studentPassword }),
  });
  const student2LoginData = await student2LoginRes.json();
  const student2Token = student2LoginData.access_token;

  // Query student 1's enrollments using student 2's token
  const getEnrollmentsFailRes = await fetch(`${ENROLLMENT_URL}/student/${studentId}`, {
    method: "GET",
    headers: withCorr({ Authorization: `Bearer ${student2Token}` }),
  });
  assert.strictEqual(getEnrollmentsFailRes.status, 403, "Student should not be allowed to access another student's data");
  console.log("✓ Correctly rejected with 403 Forbidden");

  // 11. Grade Service - Assign Grade (as Professor)
  console.log("\n11. Assigning grade to enrolled student as professor...");
  const createGradeRes = await fetch(GRADE_URL, {
    method: "POST",
    headers: {
      ...withCorr({ "Content-Type": "application/json" }),
      Authorization: `Bearer ${professorToken}`,
    },
    body: JSON.stringify({
      student: studentId,
      course: courseId,
      enrollment: enrollmentId,
      grade: "A",
      score: 95,
      remarks: "Excellent work in Physics!",
    }),
  });
  if (createGradeRes.status !== 201) {
    const errText = await createGradeRes.text();
    console.error('Grade assignment failed response body:', errText);
  }
  assert.strictEqual(createGradeRes.status, 201, "Grade assignment failed");
  const gradeData = await createGradeRes.json();
  const gradeId = gradeData._id;
  console.log(`✓ Grade assigned with ID: ${gradeId}`);

  // 12. Grade Service - Student views own grade
  console.log("\n12. Fetching student's own grades as the student...");
  const getStudentGradesRes = await fetch(`${GRADE_URL}/student/${studentId}`, {
    method: "GET",
    headers: withCorr({ Authorization: `Bearer ${studentToken}` }),
  });
  assert.strictEqual(getStudentGradesRes.status, 200, "Failed to fetch student's own grades");
  const studentGradesList = await getStudentGradesRes.json();
  assert.ok(studentGradesList.length > 0, "Student grades list is empty");
  assert.strictEqual(studentGradesList[0].grade, "A", "Returned grade is incorrect");
  console.log("✓ Student successfully retrieved their own grades!");

  // 13. Grade Service - Other student tries to view student's grade (should fail)
  console.log("\n13. Trying to fetch student's grades as another student (should fail with 403)...");
  const getStudentGradesFailRes = await fetch(`${GRADE_URL}/student/${studentId}`, {
    method: "GET",
    headers: withCorr({ Authorization: `Bearer ${student2Token}` }),
  });
  assert.strictEqual(getStudentGradesFailRes.status, 403, "Student should not be allowed to access another student's grades");
  console.log("✓ Correctly rejected with 403 Forbidden");

  // 14. Grade Service - Professor updates grade
  console.log("\n14. Updating grade as professor...");
  const updateGradeRes = await fetch(`${GRADE_URL}/${gradeId}`, {
    method: "PUT",
    headers: {
      ...withCorr({ "Content-Type": "application/json" }),
      Authorization: `Bearer ${professorToken}`,
    },
    body: JSON.stringify({
      grade: "A+",
      score: 99,
      remarks: "Exceptional final exam performance!",
    }),
  });
  assert.strictEqual(updateGradeRes.status, 200, "Failed to update grade");
  const updatedGradeData = await updateGradeRes.json();
  assert.strictEqual(updatedGradeData.grade.grade, "A+", "Updated grade is incorrect");
  assert.strictEqual(updatedGradeData.grade.score, 99, "Updated score is incorrect");
  console.log("✓ Grade updated successfully!");

  // 15. Grade Service - Admin deletes grade
  console.log("\n15. Deleting grade as admin...");
  const deleteGradeRes = await fetch(`${GRADE_URL}/${gradeId}`, {
    method: "DELETE",
    headers: withCorr({ Authorization: `Bearer ${adminToken}` }),
  });
  assert.strictEqual(deleteGradeRes.status, 200, "Failed to delete grade");
  console.log("✓ Grade deleted successfully by admin");

  // 16. Delete Enrollment (as Professor)
  console.log("\n16. Deleting enrollment as professor...");
  const deleteEnrollmentRes = await fetch(`${ENROLLMENT_URL}/${enrollmentId}`, {
    method: "DELETE",
    headers: withCorr({ Authorization: `Bearer ${professorToken}` }),
  });
  if (deleteEnrollmentRes.status !== 200) {
    const errText = await deleteEnrollmentRes.text();
    console.error('Delete enrollment failed response body:', errText);
  }
  assert.strictEqual(deleteEnrollmentRes.status, 200, "Failed to delete enrollment");
  console.log("✓ Enrollment deleted successfully");

  console.log("\n=== All Tests Passed Successfully! ===");
}

runTests().catch((err) => {
  console.error("\n❌ Test failed with error:");
  console.error(err);
  process.exit(1);
});
