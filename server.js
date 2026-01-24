const express = require("express");
const cors = require("cors");
const OpenAI = require("openai");

/* ✅ PDF UPLOAD */
const multer = require("multer");
const path = require("path");
const fs = require("fs");

/* ✅ ADDED: AUTH + DB */
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");

const app = express();
app.use(cors());
app.use(express.json());

/* ================= ✅ ADDED: MONGODB CONNECT ================= */

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB Connected"))
  .catch(err => console.error("❌ MongoDB Error:", err));

/* ================= OPENAI ================= */

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

/* ================= ✅ ADDED: DB MODELS ================= */

const TeacherSchema = new mongoose.Schema({
  schoolCode: String,
  teacherId: String,
  password: String
});

const StudentSchema = new mongoose.Schema({
  schoolCode: String,
  studentId: String,
  class: String,
  name: String,
  password: String
});

const ExamSchema = new mongoose.Schema({
  schoolCode: String,
  name: String,
  url: String,
  class: String,
  subject: String,
  chapter: String,
  questions: Array,
  answers: Object,
  createdAt: Date
});

const Teacher = mongoose.model("Teacher", TeacherSchema);
const Student = mongoose.model("Student", StudentSchema);
const Exam = mongoose.model("Exam", ExamSchema);

/* ================= ✅ ADDED: TOKEN VERIFY ================= */

function verifyToken(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth) return res.status(401).json({ msg: "No token" });

  const token = auth.split(" ")[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ msg: "Invalid token" });
  }
}

/* ================= ✅ ADDED: AUTH APIs ================= */

app.post("/api/auth/teacher-login", async (req, res) => {
  const { schoolCode, teacherId, password } = req.body;

  const teacher = await Teacher.findOne({ schoolCode, teacherId });
  if (!teacher) return res.status(401).json({ msg: "Invalid login" });

  const ok = await bcrypt.compare(password, teacher.password);
  if (!ok) return res.status(401).json({ msg: "Invalid login" });

  const token = jwt.sign(
    { role: "teacher", schoolCode },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );

  res.json({ token });
});

app.post("/api/auth/student-login", async (req, res) => {
  const { schoolCode, studentId, class: stuClass } = req.body;

  const student = await Student.findOne({
    schoolCode, studentId, class: stuClass
  });

  if (!student) return res.status(401).json({ msg: "Invalid login" });

  const token = jwt.sign(
    { role: "student", schoolCode, class: stuClass },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );

  res.json({ token });
});

/* ================= EXAM DATA FILE ================= */

const dataDir = path.join(__dirname, "data");
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const examDataFile = path.join(dataDir, "allExams.json");
let allExams = [];// 🔥 School exam


/* ✅ NEW: OLYMPIAD DATA FILE */
const olympiadDataFile = path.join(dataDir, "currentOlympiadExam.json");

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

/* ================= EXAM PDF STORAGE ================= */

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

/* ================= TEST ================= */

app.get("/", (req, res) => {
  res.send("Kidzibooks API is running");
});

/* ================= AI QUESTION GENERATOR ================= */

app.post("/api/generate", async (req, res) => {
  try {
    const { studentClass, subject, topic, difficulty, type, count } = req.body;
    if (!studentClass || !subject || !topic || !difficulty || !type || !count)
      return res.status(400).json({ success: false });

    const response = await openai.responses.create({
      model: "gpt-4.1-mini",
      input: [{ role: "user", content: `Create exam on ${topic}` }],
      temperature: 0.5
    });

    res.json({ success: true, result: response.output_text });

  } catch (err) {
    console.error("OPENAI ERROR:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/* ================= ✅ SCHOOL TEACHER UPLOAD PDF ================= */
/* (OLD FILE SAVE + NEW DB SAVE BOTH) */

app.post("/api/uploadExam", verifyToken, uploadExamPDF.single("pdf"), async (req, res) => {
  try {
    const fileUrl = `/exam_uploads/${req.file.filename}`;
    const meta = JSON.parse(req.body.meta || "{}");

    /* ===== OLD FILE STORAGE ===== */
    const newExam = {
      id: Date.now(),
      name: req.file.originalname,
      url: fileUrl,
      class: meta.class,
      subject: meta.subject,
      chapter: meta.chapter,
      questions: meta.questions || [],
      answers: meta.answers || {},
      createdAt: new Date()
    };

    allExams.push(newExam);
    fs.writeFileSync(examDataFile, JSON.stringify(allExams, null, 2));

    /* ===== ✅ NEW DB STORAGE ===== */
    const dbExam = new Exam({
      schoolCode: req.user.schoolCode,
      name: req.file.originalname,
      url: fileUrl,
      class: meta.class,
      subject: meta.subject,
      chapter: meta.chapter,
      questions: meta.questions || [],
      answers: meta.answers || {},
      createdAt: new Date()
    });

    await dbExam.save();

    res.json({ success: true, exam: newExam, dbExam });

  } catch (err) {
    console.error("UPLOAD ERROR:", err);
    res.status(500).json({ success: false });
  }
});

/* ================= OLD FILE BASED STUDENT GET EXAMS ================= */

app.get("/api/allExams", (req, res) => {
  res.json(allExams);
});

/* ================= ✅ NEW DB BASED STUDENT GET EXAMS ================= */

app.get("/api/db/allExams", verifyToken, async (req, res) => {
  const exams = await Exam.find({ schoolCode: req.user.schoolCode });
  res.json(exams);
});

/* ================= DELETE FILE EXAM ================= */

app.delete("/api/deleteExam/:id", (req, res) => {
  const id = Number(req.params.id);

  const exam = allExams.find(e => e.id === id);
  if (!exam) return res.json({ success: false });

  const filePath = path.join(__dirname, exam.url);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

  allExams = allExams.filter(e => e.id !== id);
  fs.writeFileSync(examDataFile, JSON.stringify(allExams, null, 2));

  res.json({ success: true });
});

/* ================= DELETE DB EXAM ================= */

app.delete("/api/db/deleteExam/:id", verifyToken, async (req, res) => {
  const exam = await Exam.findById(req.params.id);
  if (!exam) return res.json({ success: false });

  const filePath = path.join(__dirname, exam.url);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

  await Exam.deleteOne({ _id: exam._id });
  res.json({ success: true });
});

/* ================= OLYMPIAD ================= */

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

    res.json({ success: true, exam: olympiadExam });

  } catch (err) {
    console.error("OLYMPIAD UPLOAD ERROR:", err);
    res.status(500).json({ success: false });
  }
});

app.get("/api/currentOlympiadExam", (req, res) => {
  res.json(currentOlympiadExam);
});

/* ================= STATIC FILE ================= */

app.use("/exam_uploads", express.static(examUploadDir));
app.use("/olympiad_uploads", express.static(olympiadUploadDir));

/* ================= SERVER ================= */

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log("Server running on", PORT));
