const express = require("express");
const cors = require("cors");
// const OpenAI = require("openai");
/* ================= SOCKET.IO IMPORT ================= */
const http = require("http");
const { Server } = require("socket.io");

/* ✅ PDF UPLOAD */
const multer = require("multer");
const path = require("path");
const fs = require("fs");
// const pdf = require("pdf-poppler");

/* ✅ AUTH + DB */
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");

const app = express();
app.use(cors());
app.use(express.json());

/* ✅ MONGODB CONNECT */
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB Connected"))
  .catch(err => console.error("❌ MongoDB Error:", err));
/* ================= OPENAI ================= */

// const openai = new OpenAI({
//   apiKey: process.env.OPENAI_API_KEY
// });
const Groq = require("groq-sdk");
const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY
});

/* ================= USER MODELS ================= */
const TeacherSchema = new mongoose.Schema({
  schoolCode: String,
  teacherId: String,
  name: String,          // ✅ ADD THIS
  password: String,
  photo: String,  // ✅ ADD THIS
  photoBase64: String    // ✅ ADD THIS
});

const StudentSchema = new mongoose.Schema({
  schoolCode: String,
  studentId: String,
  class: String,
  section: String, 
  name: String,
  password: String,
  photo: String,  
  photoBase64: String,   // ✅ ADD THIS
  totalScore: { type: Number, default: 0 },
  progress: { type: Number, default: 0 },   // %
  level: { type: Number, default: 1 },
  isOnline: { type: Boolean, default: false },
  lastActive: { type: Date }
});

const Teacher = mongoose.model("Teacher", TeacherSchema);
/* ================= PRINCIPAL MODEL ================= */
const PrincipalSchema = new mongoose.Schema({
  schoolCode: { type: String, required: true, unique: true }, // ✅ only 1 per school
  principalId: { type: String, required: true },
  password: { type: String, required: true }
});

const Principal = mongoose.model("Principal", PrincipalSchema);
const Student = mongoose.model("Student", StudentSchema);

/* ================= EXAM SUBMISSION MODEL ================= */
const ExamSubmissionSchema = new mongoose.Schema({
  schoolCode: String,
  teacherId: String,   // ✅ ADD
  studentId: String,
  studentName: String,
  phone: String,  // 🔥 ADD THIS
  class: String,
  section: String,
  examId: String,
  examName: String,
  subject: String,
  chapter: String,
  type: { type: String, default: "worksheet" },  // ✅ ADDED
  questions: Array,
  answers: Object,
  result: {               // ✅ ADD THIS BLOCK
    obtainedMarks: Number,
    totalMarks: Number,
    percentage: Number,
    level: String,
    rank: String
  },
  submittedAt: {
    type: Date,
    default: Date.now
  }
});
const ExamSubmission = mongoose.model("ExamSubmission", ExamSubmissionSchema);

/* ================= QUIZ MODEL (LINK BASED EXAM) ================= */
const QuizSchema = new mongoose.Schema({
  name: String,
  description: String,
  questions: Array,
  createdAt: {
    type: Date,
    default: Date.now
  }
});
const Quiz = mongoose.model("Quiz", QuizSchema);

/* ================= LINK EXAM STUDENT MODEL ================= */
const LinkStudentSchema = new mongoose.Schema({
  name: String,
  schoolName: String,
  phone: String,
  studentClass: String,   // ✅ ADD THIS
  createdAt: {
    type: Date,
    default: Date.now
  }
});
const LinkStudent = mongoose.model("LinkStudent", LinkStudentSchema);

/* ================= NOTICE MODEL ================= */
const NoticeSchema = new mongoose.Schema({
  schoolCode: String,
  class: String,      // ✅ ADD
  section: String,    // ✅ ADD
  title: String,
  message: String,
  date: String,
  time: String,
  createdAt: {
    type: Date,
    default: Date.now
  }
});
const Notice = mongoose.model("Notice", NoticeSchema);

/* ================= SUBJECT + CHAPTER MODEL ================= */
const SubjectSchema = new mongoose.Schema({
  schoolCode: String,
  class: String,
  subject: String,
  chapters: [String]
});

const Subject = mongoose.model("Subject", SubjectSchema);

/* ================= SCHOOL MODEL ================= */
const SchoolSchema = new mongoose.Schema({
  schoolName: { type: String, required: true },
  schoolAddress: String,
  schoolId: { type: String, unique: true },
  phone: String,
  state: String,
  country: String,

  schoolCode: { type: String, unique: true, required: true },
  adminPassword: { type: String, required: true }
});
const School = mongoose.model("School", SchoolSchema);

/* ================= CLASSROOM MODEL ================= */
const ClassroomSchema = new mongoose.Schema({
  schoolCode: String,
  teacherId: String,
  roomCode: String,
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now }
});
const Classroom = mongoose.model("Classroom", ClassroomSchema);

/* ================= EXAM DATA FILE ================= */
const dataDir = path.join(__dirname, "data");
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const examDataFile = path.join(dataDir, "allExams.json");
let allExams = [];// 🔥 School exam

/* ✅ NEW: OLYMPIAD DATA FILE */
const olympiadDataFile = path.join(dataDir, "currentOlympiadExam.json");
// let currentExam = null; // 🔥 School exam
let currentOlympiadExam = null; // 🔥 Olympiad exam (SEPARATE)

/* ===== LOAD SCHOOL EXAM ===== */
if (fs.existsSync(examDataFile)) {
  try {
    const data = fs.readFileSync(examDataFile, "utf-8");
    allExams = JSON.parse(data) || [];
    console.log("✅ Loaded saved school exams:", allExams.length);
  } catch (e) {
    console.log("❌ Failed to load school exams");
  }
}

/* ===== LOAD OLYMPIAD EXAM ===== */
if (fs.existsSync(olympiadDataFile)) {
  try {
    const data = fs.readFileSync(olympiadDataFile, "utf-8");
    currentOlympiadExam = JSON.parse(data);
    console.log("✅ Loaded saved olympiad exam");
  } catch (e) {
    console.log("❌ Failed to load olympiad exam");
  }
}

/* ================= QUESTION IMAGE UPLOAD ================= */
const imageUploadDir = path.join(__dirname, "uploads");

if (!fs.existsSync(imageUploadDir)) {
  fs.mkdirSync(imageUploadDir, { recursive: true });
}

const imageStorage = multer.diskStorage({
  destination: imageUploadDir,
  filename: (req, file, cb) => {
    cb(null, Date.now() + "_IMG_" + file.originalname);
  }
});
const uploadImage = multer({ storage: imageStorage });

/* ===== IMAGE UPLOAD API ===== */
app.post("/api/uploadImage", uploadImage.single("image"), (req, res) => {
  res.json({
    success: true,
    url: `${req.protocol}://${req.get("host")}/uploads/${req.file.filename}`
  });
});

/* ================= EXAM PDF STORAGE (SCHOOL PORTAL) ================= */
const examUploadDir = path.join(__dirname, "exam_uploads");
if (!fs.existsSync(examUploadDir)) fs.mkdirSync(examUploadDir, { recursive: true });
const examStorage = multer.diskStorage({
  destination: examUploadDir,
  filename: (req, file, cb) => {
    cb(null, Date.now() + "_EXAM_" + file.originalname);
  }
});
const uploadExamPDF = multer({ storage: examStorage });

/* ================= OLYMPIAD PDF STORAGE ================= */
const olympiadUploadDir = path.join(__dirname, "olympiad_uploads");
if (!fs.existsSync(olympiadUploadDir)) fs.mkdirSync(olympiadUploadDir, { recursive: true });
const olympiadStorage = multer.diskStorage({
  destination: olympiadUploadDir,
  filename: (req, file, cb) => {
    cb(null, Date.now() + "_OLYMPIAD_" + file.originalname);
  }
});
const uploadOlympiadPDF = multer({ storage: olympiadStorage });

/* ================= PROFILE PHOTO UPLOAD ================= */
const profileUploadDir = path.join(__dirname, "profile_uploads");
if (!fs.existsSync(profileUploadDir)) {
  fs.mkdirSync(profileUploadDir, { recursive: true });
}
const profileStorage = multer.diskStorage({
  destination: profileUploadDir,
  filename: (req, file, cb) => {
    cb(null, Date.now() + "_PROFILE_" + file.originalname);
  }
});
const uploadProfilePhoto = multer({ storage: profileStorage });
app.use("/profile_uploads", express.static(profileUploadDir));

/* ================= TEST ================= */
app.get("/", (req, res) => {
  res.send("Kidzibooks API is running");
});

/* ================= CREATE QUIZ (LINK EXAM) ================= */
app.post("/api/createQuiz", async (req, res) => {
  try {
    const { name, description, questions } = req.body;
    if (!name || !questions)
      return res.json({ success: false });
    const quiz = await Quiz.create({
      name,
      description,
      questions
    });

    res.json({
      success: true,
      examId: quiz._id
    });

  } catch (err) {
    console.error("CREATE QUIZ ERROR:", err);
    res.status(500).json({ success: false });
  }
});

/* ================= LINK EXAM STUDENT LOGIN ================= */
app.post("/api/link-student/login", async (req, res) => {
  try {
    const { name, schoolName, phone, studentClass } = req.body;
    if (!phone)
      return res.json({ success: false });
    // ✅ check existing student
    let student = await LinkStudent.findOne({ phone });
    // ✅ create if not exists
    if (!student) {
      student = await LinkStudent.create({
        name,
        schoolName,
        phone,
        studentClass   // ✅ SAVE CLASS
      });
    }
    res.json({
      success: true,
      student
    });
  } catch (err) {
    console.error("LINK STUDENT LOGIN ERROR:", err);
    res.status(500).json({ success: false });
  }
});
/* ================= FETCH LINK STUDENT BY PHONE ================= */
app.get("/api/link-student/:phone", async (req, res) => {
  try {
    const student = await LinkStudent.findOne({
      phone: req.params.phone
    });
    res.json({
      success: true,
      student
    });
  } catch (err) {
    res.json({ success: false });
  }
});

/* ================= REGISTER SCHOOL ================= */
/* ---- REGISTER SCHOOL ---- */
app.post("/api/auth/register-school", async (req, res) => {
  try {
    let { schoolName, schoolAddress, schoolId, phone, state, country, schoolCode, adminPassword } = req.body;
    schoolName = schoolName?.trim();
    schoolAddress = schoolAddress?.trim();
    schoolId = schoolId?.trim();
    phone = phone?.trim();
    state = state?.trim();
    country = country?.trim();
    schoolCode = schoolCode?.trim();
    adminPassword = adminPassword?.trim();

    if (!schoolName || !schoolId || !phone || !state || !country || !schoolCode || !adminPassword)
      return res.status(400).json({ msg: "All fields required" });

    const exists = await School.findOne({ schoolCode });
    if (exists) return res.status(400).json({ msg: "School already exists" });
    // ✅ check duplicate school ID
    const idExists = await School.findOne({ schoolId });
    if (idExists) return res.status(400).json({ msg: "School ID already exists" });
    // const hash = await bcrypt.hash(adminPassword, 10);
    await School.create({
      schoolName,
      schoolAddress,
      schoolId,
      phone,
      state,
      country,
      schoolCode,
      adminPassword
    });
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ msg: "School register failed" });
  }
});

/* ---- SCHOOL LOGIN ---- */
app.post("/api/auth/school-login", async (req, res) => {
  try {
    let { schoolCode, adminPassword } = req.body;
    schoolCode = schoolCode?.trim();
    adminPassword = adminPassword?.trim();

    if (!schoolCode || !adminPassword)
      return res.status(400).json({ msg: "Invalid input" });

    const school = await School.findOne({ schoolCode });
    if (!school) return res.status(401).json({ msg: "Invalid school code" });
    // const ok = await bcrypt.compare(adminPassword, school.adminPassword);
    if (adminPassword !== school.adminPassword)
      return res.status(401).json({ msg: "Wrong password" });

    const token = jwt.sign(
      { role: "school", schoolCode },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );
    res.json({
      token,
      schoolName: school.schoolName
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ msg: "School login failed" });
  }
});
/* ================= DEVELOPER LOGIN ================= */
app.post("/api/auth/developer-login", (req, res) => {
  try {
    const { devId, devPass } = req.body;

    const DEV_ID = process.env.DEV_ID;
    const DEV_PASS = process.env.DEV_PASS;

    if (devId !== DEV_ID || devPass !== DEV_PASS) {
      return res.status(401).json({ msg: "Invalid developer login" });
    }
    const token = jwt.sign(
      { role: "developer" },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );
    res.json({ token });
  } catch (err) {
    console.error("DEV LOGIN ERROR:", err);
    res.status(500).json({ msg: "Developer login failed" });
  }
});

/* ---- REGISTER TEACHER ---- */
app.post("/api/auth/register-teacher", uploadProfilePhoto.single("photo"), async (req, res) => {
  let { schoolCode, teacherId, name, password } = req.body;
  schoolCode = schoolCode?.trim();
  teacherId = teacherId?.trim();
  password = password?.trim();
  if (!schoolCode || !teacherId || !password)
    return res.status(400).json({ msg: "Invalid input" });
  const school = await School.findOne({ schoolCode });
  if (!school) return res.status(400).json({ msg: "Invalid school code" });
  const exists = await Teacher.findOne({ schoolCode, teacherId });
  if (exists) return res.status(400).json({ msg: "Teacher already exists" });
  // const hash = await bcrypt.hash(password, 10);
 const photoUrl = req.file
  ? `/profile_uploads/${req.file.filename}`
  : "";
  const photoBase64 = req.file
    ? `data:${req.file.mimetype};base64,${fs.readFileSync(req.file.path).toString("base64")}`
    : "";
  await Teacher.create({
    schoolCode,
    teacherId,
    name,
    password,
    photo: photoUrl,        // render storage
    photoBase64: photoBase64  // 🔥 database storage
  });
  res.json({ success: true });
});
/* ---- REGISTER PRINCIPAL ---- */
app.post("/api/auth/register-principal", async (req, res) => {
  try {
    let { schoolCode, principalId, password } = req.body;

    schoolCode = schoolCode?.trim();
    principalId = principalId?.trim();
    password = password?.trim();

    if (!schoolCode || !principalId || !password)
      return res.status(400).json({ msg: "All fields required" });

    const school = await School.findOne({ schoolCode });
    if (!school) return res.status(400).json({ msg: "Invalid school code" });

    // ✅ CHECK IF ALREADY EXISTS
    const existing = await Principal.findOne({ schoolCode });
    if (existing)
      return res.status(400).json({ msg: "Principal already registered for this school" });

    await Principal.create({
      schoolCode,
      principalId,
      password
    });

    res.json({ success: true });

  } catch (err) {
    console.error("REGISTER PRINCIPAL ERROR:", err);
    res.status(500).json({ msg: "Principal register failed" });
  }
});
/* ---- REGISTER STUDENT ---- */
app.post("/api/auth/register-student", uploadProfilePhoto.single("photo"), async (req, res) => {
  let { schoolCode, studentId, class: stuClass, section, name, password } = req.body;
  schoolCode = schoolCode?.trim();
  studentId = studentId?.trim();
  stuClass = stuClass?.trim();
  name = name?.trim();
  password = password?.trim();

  if (!schoolCode || !studentId || !stuClass || !name || !password)
    return res.status(400).json({ msg: "Invalid input" });

  const school = await School.findOne({ schoolCode });
  if (!school) return res.status(400).json({ msg: "Invalid school code" });

  const exists = await Student.findOne({
    schoolCode,
    studentId,
    class: stuClass,
    section
  });
  if (exists) return res.status(400).json({ msg: "Student already exists" });
  // const hash = await bcrypt.hash(password, 10);
 const photoUrl = req.file
  ? `/profile_uploads/${req.file.filename}`
  : "";

  const photoBase64 = req.file
    ? `data:${req.file.mimetype};base64,${fs.readFileSync(req.file.path).toString("base64")}`
      : "";
   await Student.create({
      schoolCode,
      studentId,
      class: stuClass,
      section,
      name,
      password,
      photo: photoUrl,
      photoBase64: photoBase64   // 🔥 ADD THIS
    });
  res.json({ success: true });
});

/* ---- TEACHER LOGIN ---- */
app.post("/api/auth/teacher-login", async (req, res) => {
  let { schoolCode, teacherId, password } = req.body;
  schoolCode = schoolCode?.trim();
  teacherId = teacherId?.trim();
  password = password?.trim();
  const teacher = await Teacher.findOne({ schoolCode, teacherId });
  if (!teacher) return res.status(401).json({ msg: "Invalid login" });

  if (password !== teacher.password)
    return res.status(401).json({ msg: "Invalid login" });
  // ✅ ADD THIS LINE
  const school = await School.findOne({ schoolCode });
  const token = jwt.sign(
    {
      role: "teacher",
      schoolCode,
      teacherId: teacher.teacherId   // ✅ ADD THIS
    },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );
  // ✅ CHANGE THIS RESPONSE
  res.json({
    token,
    schoolName: school?.schoolName || "",
    photo: teacher.photoBase64 || teacher.photo || "",
    name: teacher.name || ""
  });
});
/* ---- PRINCIPAL LOGIN ---- */
app.post("/api/auth/principal-login", async (req, res) => {
  try {
    let { schoolCode, principalId, password } = req.body;

    schoolCode = schoolCode?.trim();
    principalId = principalId?.trim();
    password = password?.trim();

    const principal = await Principal.findOne({ schoolCode, principalId });
    if (!principal)
      return res.status(401).json({ msg: "Invalid login" });

    if (password !== principal.password)
      return res.status(401).json({ msg: "Invalid login" });

    const token = jwt.sign(
      { role: "principal", schoolCode },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({ token });

  } catch (err) {
    console.error("PRINCIPAL LOGIN ERROR:", err);
    res.status(500).json({ msg: "Principal login failed" });
  }
});
/* ---- CHECK PRINCIPAL EXISTS ---- */
app.get("/api/auth/check-principal/:schoolCode", async (req, res) => {
  try {
    const { schoolCode } = req.params;
    const principal = await Principal.findOne({ schoolCode });
    if (principal) {
      return res.json({ exists: true });
    } else {
      return res.json({ exists: false });
    }
  } catch (err) {
    console.error("CHECK PRINCIPAL ERROR:", err);
    res.status(500).json({ exists: false });
  }
});
/* ---- STUDENT LOGIN ---- */
app.post("/api/auth/student-login", async (req, res) => {
  let { schoolCode, studentId, class: stuClass, section, password } = req.body;
  schoolCode = schoolCode?.trim();
  studentId = studentId?.trim();
  stuClass = stuClass?.trim();
  section = section?.trim();
  password = password?.trim();

  const student = await Student.findOne({
    schoolCode,
    studentId,
    class: stuClass,
    section
  });
  if (!student) return res.status(401).json({ msg: "Invalid login" });
  if (password !== student.password)
    return res.status(401).json({ msg: "Invalid login" });

  await Student.updateOne(
    { schoolCode, studentId },
    { $set: { isOnline: true } }
  );

  const token = jwt.sign(
    { role: "student", schoolCode, class: stuClass },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );

  const school = await School.findOne({ schoolCode });
   res.json({
    token,
    name: student.name,
    studentId: student.studentId,
    class: student.class,
    section: student.section,
    schoolName: school?.schoolName || "",
    photo: student.photoBase64 || student.photo || ""
  });
});

/* ---- STUDENT ONLINE PING (WHEN DASHBOARD OPENS) ---- */
app.post("/api/auth/student-online", async (req, res) => {
  try {
    const { schoolCode, studentId } = req.body;

    await Student.updateOne(
      { schoolCode, studentId },
      {
        $set: {
          isOnline: true,
          lastActive: new Date()
        }
      }
    );

    res.json({ success: true });
  } catch (err) {
    console.error("STUDENT ONLINE ERROR:", err);
    res.status(500).json({ success: false });
  }
});

/* ---- STUDENT LOGOUT ---- */
app.post("/api/auth/student-logout", async (req, res) => {
  try {
    const { schoolCode, studentId } = req.body;

    await Student.updateOne(
      { schoolCode, studentId },
      {
        $set: {
          isOnline: false,
          lastActive: new Date()
        }
      }
    );

    res.json({ success: true });
  } catch (err) {
    console.error("STUDENT LOGOUT ERROR:", err);
    res.status(500).json({ success: false });
  }
});

/* ================= RESET PASSWORD ================= */
app.post("/api/auth/reset-password", async (req, res) => {
  try {
    let { role, schoolCode, teacherId, studentId, newPassword } = req.body;

    schoolCode = schoolCode?.trim();
    teacherId = teacherId?.trim();
    studentId = studentId?.trim();
    newPassword = newPassword?.trim();

    if (!role || !schoolCode || !newPassword)
      return res.status(400).json({ msg: "Invalid input" });

    // const hash = await bcrypt.hash(newPassword, 10);

    if (role === "school") {
      const r = await School.updateOne(
        { schoolCode },
        { $set: { adminPassword: newPassword } }
      );
      if (!r.matchedCount) return res.status(404).json({ msg: "School not found" });
    }

    if (role === "teacher") {
      if (!teacherId) return res.status(400).json({ msg: "Teacher ID required" });

      const r = await Teacher.updateOne(
        { schoolCode, teacherId },
        { $set: { password: newPassword } }
      );
      if (!r.matchedCount) return res.status(404).json({ msg: "Teacher not found" });
    }

    if (role === "student") {
      if (!studentId) return res.status(400).json({ msg: "Student ID required" });

      const r = await Student.updateOne(
        { schoolCode, studentId },
        { $set: { password: newPassword } }
      );
      if (!r.matchedCount) return res.status(404).json({ msg: "Student not found" });
    }
    if (role === "principal") {
  const r = await Principal.updateOne(
    { schoolCode },
    { $set: { password: newPassword } }
  );

  if (!r.matchedCount)
    return res.status(404).json({ msg: "Principal not found" });
}

    res.json({ success: true, msg: "Password updated successfully" });

  } catch (err) {
    console.error("RESET PASSWORD ERROR:", err);
    res.status(500).json({ msg: "Password reset failed" });
  }
});

/* ================= SAVE SUBJECT & CHAPTER ================= */
app.post("/api/addSubjectChapter", async (req, res) => {
  try {
    const { schoolCode, className, subject, chapter } = req.body;

    if (!schoolCode || !className || !subject)
      return res.status(400).json({ success: false });

    let doc = await Subject.findOne({ schoolCode, class: className, subject });

    if (!doc) {
      doc = new Subject({
        schoolCode,
        class: className,
        subject,
        chapters: chapter ? [chapter] : []
      });
    } else if (chapter && !doc.chapters.includes(chapter)) {
      doc.chapters.push(chapter);
    }

    await doc.save();
    res.json({ success: true });

  } catch (err) {
    console.error("ADD SUBJECT ERROR:", err);
    res.status(500).json({ success: false });
  }
});

/* ================= ADD NOTICE ================= */
app.post("/api/addNotice", async (req, res) => {
  try {
    const {
      schoolCode,
      class: noticeClass,
      section: noticeSection,
      title,
      message,
      date,
      time
    } = req.body;
    if (!schoolCode || !title || !message) {
      return res.json({ success: false });
    }
    const newNotice = new Notice({
      schoolCode,
      class: noticeClass || "All",
      section: noticeSection || "All",
      title,
      message,
      date,
      time
    });
    await newNotice.save();
    res.json({ success: true });
  } catch (err) {
    console.error("ADD NOTICE ERROR:", err);
    res.status(500).json({ success: false });
  }
});

/* ================= GET NOTICES ================= */
app.get("/api/notices/:schoolCode", async (req, res) => {
  try {
    const notices = await Notice.find({
      schoolCode: req.params.schoolCode
    }).sort({ createdAt: -1 });

    res.json(notices);
  } catch (err) {
    console.error("GET NOTICE ERROR:", err);
    res.json([]);
  }
});

/* ================= DELETE NOTICE ================= */
app.delete("/api/deleteNotice/:id", async (req, res) => {
  try {
    await Notice.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    console.error("DELETE NOTICE ERROR:", err);
    res.json({ success: false });
  }
});

/* ================= GET SUBJECTS & CHAPTERS ================= */
app.get("/api/subjects/:schoolCode/:className", async (req, res) => {
  try {
    const { schoolCode, className } = req.params;

    const list = await Subject.find({ schoolCode, class: className });
    res.json(list);

  } catch (err) {
    console.error("LOAD SUBJECT ERROR:", err);
    res.status(500).json([]);
  }
});

/* ================= DELETE FULL SUBJECT ================= */
app.delete("/api/deleteSubject/:schoolCode/:className/:subject", async (req, res) => {
  try {
    const { schoolCode, className, subject } = req.params;

    await Subject.deleteOne({ schoolCode, class: className, subject });

    // ❗ also delete exams from FILE
    allExams = allExams.filter(
      e => !(e.class === className && e.subject === subject)
    );

    fs.writeFileSync(examDataFile, JSON.stringify(allExams, null, 2));

    res.json({ success: true });

  } catch (err) {
    console.error("DELETE SUBJECT ERROR:", err);
    res.status(500).json({ success: false });
  }
});

/* ================= DELETE ONLY CHAPTER ================= */
app.delete("/api/deleteChapter", async (req, res) => {
  try {
    const { schoolCode, className, subject, chapter } = req.body;

    await Subject.updateOne(
      { schoolCode, class: className, subject },
      { $pull: { chapters: chapter } }
    );

    // ❗ delete only that chapter exams from FILE
    allExams = allExams.filter(
      e => !(e.class === className && e.subject === subject && e.chapter === chapter)
    );

    fs.writeFileSync(examDataFile, JSON.stringify(allExams, null, 2));

    res.json({ success: true });

  } catch (err) {
    console.error("DELETE CHAPTER ERROR:", err);
    res.status(500).json({ success: false });
  }
});

/* ================= GET STUDENTS CLASS-WISE ================= */
app.get("/api/teacher/students/:schoolCode/:stuClass", async (req, res) => {
  try {
    const { schoolCode, stuClass } = req.params;

    const students = await Student.find(
      { schoolCode, class: stuClass },
      { password: 0 } // ❌ do not send password
    );

    res.json(students);
  } catch (err) {
    console.error("GET STUDENTS ERROR:", err);
    res.status(500).json({ msg: "Failed to load students" });
  }
});
/* ================================================================================= PRINCIPAL GET ALL USERS ================= */
app.get("/api/principal/all-users/:schoolCode", async (req, res) => {
  try {
    const { schoolCode } = req.params;
    // 🔹 Get teachers (hide password)
    const teachers = await Teacher.find(
      { schoolCode },
      { password: 0 }
    );
    // 🔹 Get students (hide password)
    const students = await Student.find(
      { schoolCode },
      { password: 0 }
    );
    // 🔹 Get all exam submissions of this school
    const submissions = await ExamSubmission.find({ schoolCode });
    // ================= TEACHER REPORT =================
    const teacherReports = teachers.map(t => {
      const teacherSubmissions = submissions.filter(
        sub =>
          sub.schoolCode === schoolCode &&   // ✅ FILTER BY SCHOOL
          sub.teacherId === t.teacherId      // ✅ FILTER BY TEACHER
      );
     return {
        ...t._doc,
        photo: t.photoBase64 || t.photo || "",
        totalSubmissions: teacherSubmissions.length
      };
    });

    // ================= STUDENT REPORT =================
    const studentReports = students.map(s => {
      const studentSubs = submissions.filter(
        sub => sub.studentId === s.studentId
      );
      return {
          ...s._doc,
          photo: s.photoBase64 || s.photo || "",
          totalExamsAttempted: studentSubs.length
        };
    });
    res.json({
      teachers: teacherReports,
      students: studentReports
    });

  } catch (err) {
    console.error("PRINCIPAL FETCH ERROR:", err);
    res.status(500).json({ msg: "Failed to load data" });
  }
});

/* ================= SAVE STUDENT SCORE ================= */
app.post("/api/student/save-score", async (req, res) => {
  try {
    const { schoolCode, studentId, score, progress, level } = req.body;

    await Student.updateOne(
      { schoolCode, studentId },
      {
        $inc: { totalScore: score },
        $set: {
          progress: progress,
          level: level,
          isOnline: true,
          lastActive: new Date()
        }
      }
    );

    res.json({ success: true });
  } catch (err) {
    console.error("SAVE SCORE ERROR:", err);
    res.status(500).json({ msg: "Score save failed" });
  }
});

/* ================= CLASS RANKING (SAME SCHOOL + CLASS) ================= */
app.get("/api/student/ranking/:schoolCode/:stuClass", async (req, res) => {
  try {
    const { schoolCode, stuClass } = req.params;

    const students = await Student.find(
      { schoolCode, class: stuClass },
      { password: 0 }
    )
      .sort({ totalScore: -1 })
      .limit(50);

    res.json(students);
  } catch (err) {
    console.error("RANKING ERROR:", err);
    res.status(500).json({ msg: "Ranking fetch failed" });
  }
});
/* ================= GET STUDENT PROFILE ================= */
app.get("/api/student/profile/:schoolCode/:studentId", async (req, res) => {
  try {
    const { schoolCode, studentId } = req.params;
    const student = await Student.findOne(
      { schoolCode, studentId },
      { password: 0 }
    );
    if (!student)
      return res.status(404).json({ msg: "Student not found" });
    res.json({
      student: {
        ...student._doc,
        photo: student.photoBase64 || student.photo || ""
      }
    });
  } catch (err) {
    console.error("PROFILE ERROR:", err);
    res.status(500).json({ msg: "Profile load failed" });
  }
});
/* ================= GET TEACHER PROFILE ================= */
app.get("/api/teacher/profile/:schoolCode/:teacherId", async (req, res) => {
  try {
    const { schoolCode, teacherId } = req.params;
    const teacher = await Teacher.findOne(
      { schoolCode, teacherId },
      { password: 0 }
    );
    if (!teacher) {
      return res.status(404).json({ msg: "Teacher not found" });
    }
    res.json({
      teacher: {
        ...teacher._doc,
        photo: teacher.photoBase64 || teacher.photo || ""
      }
    });
  } catch (err) {
    console.error("TEACHER PROFILE ERROR:", err);
    res.status(500).json({ msg: "Profile load failed" });
  }
});

/* ================= AI QUESTION GENERATOR ================= */
app.post("/api/generate", async (req, res) => {
  try {
    const { studentClass, subject, topic, difficulty, type, count } = req.body;
    const { message } = req.body;  /* ====== AI Conversation =========== */

    if (!studentClass || !subject || !topic || !difficulty || !type || !count) {
      return res.status(400).json({ success: false });
    }

    let prompt = "";

    if (type === "NOTES") {
      prompt = `
Create detailed STUDY NOTES for school students as per CBSE.

Class: ${studentClass}
Subject: ${subject}
Topic: ${topic}
Difficulty Level: ${difficulty}

IMPORTANT RULES:
- This is NOT a question paper
- Give clear explanation in simple language
- Use short paragraphs and headings in plain text
- Include definitions, key points and examples
- Suitable for revision before exam
- No questions, no answer key

Start exactly like this:

STUDY NOTES – ${topic.toUpperCase()}

Then give topic-wise explanation.
`;
    }
    // =================start conversartion code =====================//
    else if (type === "CONVERSATION" || type === "CHAT") {
      prompt = `
You are a friendly AI English speaking assistant like ChatGPT.

This is a LIVE conversation to help the student practice spoken English.

STRICT RULES:
- Talk naturally like a human
- Keep replies short (1–2 sentences)
- Correct mistakes politely
- Ask ONLY ONE follow-up question
- Do NOT create question papers
- Do NOT number questions
- Do NOT give answer keys
- Do NOT be formal or exam-like

Student class: ${studentClass}

Student just said:
"${message}"

Reply in simple English.
Then ask ONE friendly follow-up question.
`;
    }
    // =================start CODING else if blok code =====================//
    else if (type === "CODING") {
      const { language } = req.body;

      prompt = `
You are a VERY STRICT coding teacher for school students.

STUDENT DETAILS:
- Class Level: ${studentClass}
- Programming Language: ${language}
- Difficulty: ${difficulty}

STRICT RULES:
- Ask ONLY ONE coding practice question
- Question MUST match class level
- Question MUST match programming language
- NEVER mix languages
- NEVER go above the level
- Do NOT explain anything in words
- Provide ONLY code inside ANSWER_CODE
- Simple student-friendly language

IMPORTANT:
- AFTER the student solves, the correct answer must be shown
- So you MUST also provide the RIGHT ANSWER CODE

========================
CLASS & LANGUAGE RULES
========================

Class 1–2:
- HTML: ALL heading tags h1–h6, can also use <p>
- JS: console.log only
- Python: print only
- C: print Hello World
- C++: print Hello World

Class 3–4:
- HTML: multiple headings, line breaks
- JS: variables + console.log
- Python: variables + print
- C: printf with variable
- C++: cout with variable

Class 5–6:
- HTML: lists, bold, italic
- JS: if condition OR simple loop
- Python: if condition OR simple loop
- C: if condition OR simple loop
- C++: if condition OR simple loop

Class 7–8:
- HTML: tables, links, images
- JS: loops + functions
- Python: loops + functions
- C: loops + simple function
- C++: loops + simple function

Class 9–12:
- HTML: form, input, table
- JS: functions + arrays
- Python: functions + lists
- C: arrays + loops
- C++: arrays + loops

Pro:
- Real-world problem using ${language}
Return EXACTLY in this format (NO extra text):
========================
OUTPUT FORMAT (STRICT)
========================
QUESTION:
<one clear coding question>

STARTER_CODE:
<starter code if helpful, otherwise empty>

ANSWER_CODE:
<correct solution code only>

========================
STARTER CODE RULES
========================

HTML:
<!-- Write your HTML here -->

JavaScript:
console.log("");

Python:
print("")

C:
#include <stdio.h>
int main() {

  return 0;
}

C++:
#include <iostream>
using namespace std;
int main() {

  return 0;
}
`;
    }
    // =================end conversartion else if blok code =====================//
    else if (type === "ALL") {

      prompt = `
Create a SCHOOL EXAM question paper strictly as per CBSE pattern.

Class: ${studentClass}
Subject: ${subject}
Topic: ${topic}
Difficulty Level: ${difficulty}

VERY IMPORTANT – FOLLOW STRICTLY:
- The number ${count} means QUESTIONS PER SECTION
- DO NOT treat ${count} as total questions
- EACH section must contain EXACTLY ${count} questions
- DO NOT add extra or fewer questions
- DO NOT mix question types between sections
- Do NOT use #, ##, ###, *, **, ---, ___, bullets

Start the paper EXACTLY like this:

QUESTION PAPER – ${topic.toUpperCase()}

SECTION A: MCQs
Generate EXACTLY ${count} MCQ questions.

SECTION B: True / False
Generate EXACTLY ${count} True / False questions.

SECTION C: Fill in the Blanks
Generate EXACTLY ${count} Fill in the Blanks questions.

SECTION D: Match the Following
IMPORTANT – FOLLOW STRICTLY:
- Create ONLY ONE Match the Following question
- DO NOT create Set 1, Set 2, or multiple tables
- The number ${count} means MATCHING PAIRS IN ONE SET
- Generate EXACTLY ${count} matching pairs
- Use numbers (1, 2, 3...) for Column A
- Use letters (a, b, c...) for Column B
- Do NOT repeat items in Column A or Column B

FORMAT (FOLLOW STRICTLY):
Column A                     Column B
1. Item from Column A        a) Matching item
2. Item from Column A        b) Matching item
3. Item from Column A        c) Matching item
... continue until EXACTLY ${count} pairs are completed


SECTION E: Descriptive Questions
Generate EXACTLY ${count} Descriptive questions.
Use Explain / Describe / Why / Short note.

FORMAT RULES:
- Plain text only
- Proper numbering in each section
- Questions must be strictly from the given topic
- Student-friendly language

After ALL sections, write:

ANSWER KEY
Provide answers section-wise.
`;
    } else {
      prompt = `
Create a SCHOOL EXAM question paper strictly as per CBSE pattern.

Class: ${studentClass}
Subject: ${subject}
Topic: ${topic}
Difficulty Level: ${difficulty}
Question Type: ${type}

IMPORTANT FORMAT RULES (FOLLOW STRICTLY):
- Use ONLY plain text
- Do NOT use #, ##, ###, *, **, ---, ___, bullets
- Show topic name at the top in UPPERCASE
- Always start with a SECTION heading
- Proper numbering (1, 2, 3)
- Student-friendly language
- Do NOT mix answers with questions
- Add a separate ANSWER KEY at the end
- Questions must be strictly from SUBJECT and TOPIC

Start the paper EXACTLY like this:
QUESTION PAPER – ${topic.toUpperCase()}
SECTION: ${type}
Then generate ${count} questions under this section.
After questions write:
ANSWER KEY
and then answers.
`;
    }
    const chat = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant", // ⭐ BEST FREE MODEL
      messages: [
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.5
    });

    const output = chat.choices[0]?.message?.content || "";
    console.log("AI OUTPUT:", output.slice(0, 200));
    res.json({
      success: true,
      result: output
    });

  } catch (err) {
    console.error("OPENAI ERROR:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});


/* ================= ✅ VERIFY TOKEN ================= */
// 🔐 VERIFY TOKEN
const verifyToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ msg: "No token" });

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // contains schoolCode
    next();
  } catch (err) {
    return res.status(401).json({ msg: "Invalid token" });
  }
};
/* ================= ✅ SCHOOL TEACHER UPLOAD PDF ================= */
app.post("/api/uploadExam", verifyToken, uploadExamPDF.single("pdf"), async (req, res) => {
  try {

    const fileUrl = `/exam_uploads/${req.file.filename}`;
    const meta = JSON.parse(req.body.meta || "{}");

    // ✅ FIX QUESTIONS (SUPPORT TEXT + IMAGE OPTIONS)
    const fixedQuestions = (meta.questions || []).map(q => ({
      question: q.question || "",
      // image: q.image || null,
      questionImage: q.questionImage || q.image || null,

      options: (q.options || []).map(opt => {
        if (!opt) return "";

        if (typeof opt === "string") {
          return { text: opt, image: null };
        }
        return {
          text: opt.text || "",
          image: opt.image || null
        };
      })
    }));

    const newExam = {
      id: Date.now(),
      schoolCode: req.user.schoolCode,
      teacherId: req.user.teacherId,
    
      name: req.file.originalname,
      url: fileUrl,
    
      class: meta.class,
      subject: meta.subject,
      chapter: meta.chapter,
      type: meta.type || "worksheet",
    
      // ⭐ ADD THESE 3 LINES
      examDate: meta.examDate || "",
      startTime: meta.startTime || "",
      endTime: meta.endTime || "",
    
      questions: fixedQuestions,
      answers: meta.answers || {},
      pageImages: meta.pageImages || []
    };

    allExams.push(newExam);
    fs.writeFileSync(examDataFile, JSON.stringify(allExams, null, 2));
    console.log("✅ School exam added. Total:", allExams.length);
    res.json({ success: true, exam: newExam });
  } catch (err) {
    console.error("UPLOAD ERROR:", err);
    res.status(500).json({ success: false });
  }
});

/* ================= ✅ STUDENT GET SCHOOL EXAM ================= */
app.get("/api/exams", verifyToken, (req, res) => {
  const { schoolCode, role, teacherId } = req.user;
  const now = new Date();

  const filtered = allExams.filter(exam => {
    if (exam.schoolCode !== schoolCode) return false;
    // ✅ TEACHER sees only their exams
    if (role === "teacher") {
      return exam.teacherId === teacherId;
    }

    // ✅ STUDENT sees only exam type
    if (role === "student") {
      if (exam.type !== "exam") return false;

      if (exam.examDate && exam.startTime && exam.endTime) {
        const start = new Date(`${exam.examDate}T${exam.startTime}`);
        const end = new Date(`${exam.examDate}T${exam.endTime}`);

        if (now < start) return false;
        if (now > end) return false;
      }
      return true;
    }
    return true;
  });
  res.json(filtered);
});
/* ================= GET QUIZ BY ID ================= */
app.get("/api/exam/:id", async (req, res) => {
  try {
    const quiz = await Quiz.findById(req.params.id);
    if (!quiz)
      return res.status(404).json({ success: false });

    // res.json(quiz);
    res.json({
      success: true,
      data: quiz
    });
  } catch (err) {
    console.error("GET QUIZ ERROR:", err);
    res.status(500).json({ success: false });
  }
});

/* ================= ✅ STUDENT GET delete EXAM pdf================= */
app.delete("/api/deleteExam/:id", verifyToken, (req, res) => {
    const id = Number(req.params.id);
    const schoolCode = req.user.schoolCode;
    const exam = allExams.find(
      e => e.id === id && e.schoolCode === schoolCode
    );
  
    if (!exam) return res.json({ success: false });
    const filePath = path.join(__dirname, exam.url);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  
    allExams = allExams.filter(
      e => !(e.id === id && e.schoolCode === schoolCode)
    );
  
    fs.writeFileSync(examDataFile, JSON.stringify(allExams, null, 2));
    res.json({ success: true });
  });


/* ================= ✅ OLYMPIAD PDF UPLOAD ================= */
app.post("/api/uploadOlympiadPDF", uploadOlympiadPDF.single("pdf"), (req, res) => {
  try {
    const fileUrl = `/olympiad_uploads/${req.file.filename}`;
    const meta = JSON.parse(req.body.meta || "{}");

    const olympiadExam = {
      name: req.file.originalname,
      url: fileUrl,
      questions: meta.questions || [],
      answers: meta.answers || {}
    };

    currentOlympiadExam = olympiadExam;

    fs.writeFileSync(olympiadDataFile, JSON.stringify(currentOlympiadExam, null, 2));

    console.log("✅ Olympiad exam saved");

    res.json({ success: true, exam: olympiadExam });

  } catch (err) {
    console.error("OLYMPIAD UPLOAD ERROR:", err);
    res.status(500).json({ success: false });
  }
});

/* ================= ✅ STUDENT GET OLYMPIAD EXAM ================= */
app.get("/api/currentOlympiadExam", (req, res) => {
  res.json(currentOlympiadExam);
});

/* ================= STUDENT SUBMIT EXAM ================= */
/* ================= STUDENT SUBMIT EXAM ================= */
app.post("/api/submitExam", async (req, res) => {
  try {
    const {
      schoolCode,
      studentId,
      studentName,
      phone,
      class: stuClass,
      section,
      examId,
      examName,
      subject,
      chapter,
      type,
      questions,
      answers,
      result
    } = req.body;

    // 🔎 FIND EXAM FROM FILE
    const exam = allExams.find(
      e => Number(e.id) === Number(examId)
    );
    // ⭐ CHECK EXAM TIME
    if (exam.examDate && exam.startTime && exam.endTime) {
  
      const now = new Date();
      const start = new Date(`${exam.examDate}T${exam.startTime}`);
      const end = new Date(`${exam.examDate}T${exam.endTime}`);
    
      if (now < start) {
        return res.json({
          success:false,
          message:"Exam has not started yet"
        });
      }
    
      if (now > end) {
        return res.json({
          success:false,
          message:"Exam time is over"
        });
      }
    }
// ======================================
    if (!exam) {
      return res.status(400).json({
        success: false,
        message: "Exam not found"
      });
    }

    // 🔒 CHECK IF ALREADY SUBMITTED
    const existingSubmission = await ExamSubmission.findOne({
      examId,
      studentId,
      phone,
      // type: "exam"
    });
    if (existingSubmission) {
      return res.status(400).json({
        success: false,
        message: "Exam already solved by this student"
      });
    }
    if (!studentId && !phone) {
      return res.status(400).json({
        success: false,
        message: "Student identification missing"
      });
    }

    // ✅ CREATE SUBMISSION
    const submission = await ExamSubmission.create({
      schoolCode,
      teacherId: exam.teacherId || "",
      studentId,
      studentName,
      phone,
      class: stuClass,
      section,
      examId,
      examName,
      subject,
      chapter,
      type: type === "exam" ? "exam" : "worksheet",
      questions,
      answers,
      result,
      submittedAt: new Date()
    });
    console.log("✅ Exam submitted:", submission._id);
    res.json({ success: true });
  } catch (err) {
    console.error("SUBMIT EXAM ERROR:", err);
    res.status(500).json({ success: false });
  }
});

/* ================= STUDENT GET OWN SUBMISSIONS ================= */
app.get("/api/student-submissions/:studentId", async (req, res) => {
  try {
    const submissions = await ExamSubmission.find({
      studentId: req.params.studentId,
      type: "exam"
    });

    res.json(submissions);

  } catch (err) {
    console.error("GET STUDENT SUBMISSIONS ERROR:", err);
    res.json([]);
  }
});

/* ================= TEACHER GET SUBMITTED EXAMS ================= */
app.get("/api/teacher/submissions/:schoolCode", verifyToken, async (req, res) => {
  try {
    const { schoolCode } = req.params;
    const { teacherId } = req.user;   // ✅ from token
    const submissions = await ExamSubmission
      .find({
        schoolCode: schoolCode,
        teacherId: teacherId
      })
      .sort({ submittedAt: -1 });
    res.json(submissions);
  } catch (err) {
    console.error("GET SUBMISSIONS ERROR:", err);
    res.json([]);
  }
});
/* ================= DELETE SUBMISSION ================= */
app.delete("/api/deleteSubmission/:id", async (req, res) => {
  try {

    await ExamSubmission.findByIdAndDelete(req.params.id);

    res.json({ success: true });

  } catch (err) {
    console.error("DELETE SUBMISSION ERROR:", err);
    res.json({ success: false });
  }
});

/* ================= CREATE CLASSROOM ================= */
app.post("/api/classroom/create", async (req, res) => {
  try {
    const { schoolCode, teacherId } = req.body;

    const roomCode = Math.random()
      .toString(36)
      .substring(2, 8)
      .toUpperCase();

    await Classroom.create({
      schoolCode,
      teacherId,
      roomCode
    });

    res.json({
      success: true,
      roomCode
    });

  } catch (err) {
    console.error("CLASSROOM CREATE ERROR:", err);
    res.status(500).json({ success: false });
  }
});

/* ================= VERIFY CLASSROOM ================= */
app.get("/api/classroom/:roomCode", async (req, res) => {
  try {
    const classroom = await Classroom.findOne({
      roomCode: req.params.roomCode,
      isActive: true
    });

    if (!classroom)
      return res.json({ success: false });

    res.json({ success: true });

  } catch (err) {
    res.json({ success: false });
  }
});
/* ================= STATIC FILE SERVING ================= */
app.use("/uploads", express.static(imageUploadDir));

app.use("/exam_uploads", express.static(examUploadDir));
app.use("/olympiad_uploads", express.static(olympiadUploadDir));

/* ================= SERVER ================= */
// const PORT = process.env.PORT || 5000;
// app.listen(PORT, () => console.log("Server running on", PORT));

/* ============================= SOCKET.IO SERVER =============================================== */
const PORT = process.env.PORT || 5000;
/* 🔥 Create HTTP Server */
const server = http.createServer(app);
/* 🔥 Attach Socket.io */
const io = new Server(server, {
  cors: { origin: "*" }
});
// ✅ ADD THIS
const activeStudents = {};
// ✅ STORE TEACHER SOCKET PER ROOM
const teacherSockets = {};
/* 🔥 SOCKET EVENTS */
io.on("connection", (socket) => {

  console.log("User connected:", socket.id);

  /* ===== Teacher creates class ===== */
  // socket.on("create-class", (roomCode) => {
  //   socket.join(roomCode);
  //   socket.emit("class-created", roomCode);
  // });
  socket.on("create-class", (roomCode) => {
    socket.join(roomCode);
    // ✅ Save teacher socket
    teacherSockets[roomCode] = socket.id;
    socket.emit("class-created", roomCode);
  });

  /* ===== Student joins class ===== */
  /* ===== Student sends join request ===== */
  socket.on("join-request", ({ roomCode, studentName }) => {
    socket.studentName = studentName; // ✅ ADD THIS
    const room = io.sockets.adapter.rooms.get(roomCode);
    if (room) {
      socket.to(roomCode).emit("new-join-request", {
        socketId: socket.id,
        studentName,
        roomCode
      });
    }
  });
  /* ===== Teacher approves student ===== */
  socket.on("approve-student", ({ socketId, roomCode }) => {
    const studentSocket = io.sockets.sockets.get(socketId);
    if (studentSocket) {

      studentSocket.join(roomCode);
      studentSocket.emit("approved");
      // 🔥 ADD STUDENT TO ACTIVE LIST
      if (!activeStudents[roomCode]) {
        activeStudents[roomCode] = [];
      }
      // activeStudents[roomCode].push({
      //    socketId,
      //    studentName: studentSocket.studentName || "Student"
      //  });
      if (!activeStudents[roomCode].some(s => s.socketId === socketId)) {
        activeStudents[roomCode].push({
          socketId,
          studentName: studentSocket.studentName || "Student"
        });
      }
      // 🔥 SEND UPDATED LIST TO TEACHER
      io.to(roomCode).emit(
        "update-student-list",
        activeStudents[roomCode]
      );
      socket.emit("student-joined", socketId);
    }
  });

  /* ===== Teacher rejects student ===== */
  socket.on("reject-student", (student) => {
    const { socketId } = student;
    const studentSocket = io.sockets.sockets.get(socketId);
    if (studentSocket) {
      studentSocket.emit("rejected");
    }
  });

  /* ===== WebRTC Offer ===== */
  socket.on("offer", (data) => {
    socket.to(data.to).emit("offer", {
      offer: data.offer,
      from: socket.id
    });
  });

  /* ===== WebRTC Answer ===== */
  socket.on("answer", (data) => {
    socket.to(data.to).emit("answer", {
      answer: data.answer,
      from: socket.id
    });
  });;

  socket.on("ice-candidate", (data) => {
    socket.to(data.to).emit("ice-candidate", {
      candidate: data.candidate,
      from: socket.id
    });
  });
  /* ===== PRIVATE TEACHER-STUDENT CHAT ===== */
  /* ===== PRIVATE TEACHER-STUDENT CHAT ===== */
  socket.on("private-message", ({ roomCode, toStudentId, message, messageId }) => {
    const teacherId = teacherSockets[roomCode];
    // 🔥 If TEACHER is sending
    if (socket.id === teacherId) {
      const studentSocket = io.sockets.sockets.get(toStudentId);
      if (studentSocket) {
        studentSocket.emit("receive-message", {
          from: "teacher",
          message,
          messageId   // ✅ SEND ID
        });
      }
    }
    // 🔥 If STUDENT is sending
    else {
      const teacherSocket = io.sockets.sockets.get(teacherId);
      if (teacherSocket) {
        teacherSocket.emit("receive-message", {
          from: "student",
          studentId: socket.id,
          message,
          messageId   // ✅ SEND ID
        });
      }
    }
  });
  /* ===== DELETE MESSAGE FOR BOTH SIDES ===== */
  /* ===== DELETE MESSAGE FOR BOTH SIDES (FINAL FIX) ===== */
  socket.on("delete-message", ({ roomCode, chatId, messageId }) => {
    const teacherId = teacherSockets[roomCode];
    // 🔥 If TEACHER is deleting
    if (socket.id === teacherId) {
      // Send delete event to the student
      const studentSocket = io.sockets.sockets.get(chatId);
      if (studentSocket) {
        studentSocket.emit("message-deleted", {
          chatId,      // student chat id
          messageId
        });
      }
      // Also delete on teacher side
      socket.emit("message-deleted", {
        chatId,
        messageId
      });
    }

    // 🔥 If STUDENT is deleting
    else {
      // Send delete event to teacher
      const teacherSocket = io.sockets.sockets.get(teacherId);
      if (teacherSocket) {
        teacherSocket.emit("message-deleted", {
          chatId: socket.id,   // student socket id
          messageId
        });
      }
      // Delete on student side
      socket.emit("message-deleted", {
        chatId: socket.id,   // 🔥 FIXED (IMPORTANT)
        messageId
      });
    }
  });
  /* ===== STUDENT CAMERA OFF ===== */
  socket.on("student-camera-off", ({ roomCode }) => {
    const teacherId = teacherSockets[roomCode];
    if (teacherId) {
      const teacherSocket = io.sockets.sockets.get(teacherId);
      if (teacherSocket) {
        teacherSocket.emit("student-camera-off", {
          studentId: socket.id
        });
      }
    }
  });
  /* ===== TEACHER CAMERA OFF ===== */
  socket.on("teacher-camera-off", ({ roomCode }) => {
    // send event to all students in the room
    socket.to(roomCode).emit("teacher-camera-off");
  });
  
  // ✅ AUTO REMOVE STUDENT WHEN DISCONNECT
  socket.on("disconnect", () => {
    for (const room in activeStudents) {
      activeStudents[room] = activeStudents[room].filter(
        s => s.socketId !== socket.id
      );
      io.to(room).emit("update-student-list", activeStudents[room]);
    }
  });

  /* ===== REMOVE STUDENT BY TEACHER ===== */
  socket.on("remove-student", ({ socketId, roomCode }) => {

    const studentSocket = io.sockets.sockets.get(socketId);

    if (studentSocket) {
      studentSocket.leave(roomCode);
      studentSocket.emit("removed-by-teacher");
    }

    // Remove from active list
    if (activeStudents[roomCode]) {
      activeStudents[roomCode] =
        activeStudents[roomCode].filter(
          s => s.socketId !== socketId
        );

      io.to(roomCode).emit(
        "update-student-list",
        activeStudents[roomCode]
      );
    }
  });
  /* ===== Teacher rejoin after refresh =================21/02/26 ==== */
  socket.on("rejoin-class", async (roomCode) => {
    const classroom = await Classroom.findOne({
      roomCode,
      isActive: true
    });

    if (classroom) {
      socket.join(roomCode);

      // 🔥 Send current student list again
      if (activeStudents[roomCode]) {
        socket.emit(
          "update-student-list",
          activeStudents[roomCode]
        );
      }
    }
  });
  /* ===== Teacher closes class==============================21/02/26 ===== */
  socket.on("close-class", async (roomCode) => {
    // Set classroom inactive in DB
    await Classroom.updateOne(
      { roomCode },
      { $set: { isActive: false } }
    );

    // Remove all students
    if (activeStudents[roomCode]) {
      activeStudents[roomCode].forEach(student => {
        const studentSocket =
          io.sockets.sockets.get(student.socketId);

        if (studentSocket) {
          studentSocket.emit("removed-by-teacher");
          studentSocket.leave(roomCode);
        }
      });
      delete activeStudents[roomCode];
    }
    io.to(roomCode).emit("class-closed");
  });

});   // ✅ THIS WAS MISSING (close io.on)

/* 🔥 Start Server */
server.listen(PORT, () => {
  console.log("Server running on", PORT);
});
