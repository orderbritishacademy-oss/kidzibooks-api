const express = require("express");
const cors = require("cors");
// const OpenAI = require("openai");

/* ✅ PDF UPLOAD */
const multer = require("multer");
const path = require("path");
const fs = require("fs");
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
  password: String
});

const StudentSchema = new mongoose.Schema({
  schoolCode: String,
  studentId: String,
  class: String,
  name: String,
  password: String,

  // ✅ PERFORMANCE DATA
  totalScore: { type: Number, default: 0 },
  progress: { type: Number, default: 0 },   // %
  level: { type: Number, default: 1 },
  isOnline: { type: Boolean, default: false },
  lastActive: { type: Date }
});


const Teacher = mongoose.model("Teacher", TeacherSchema);
const Student = mongoose.model("Student", StudentSchema);

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

/* ================= TEST ================= */

app.get("/", (req, res) => {
  res.send("Kidzibooks API is running");
});
/* ================= AUTH APIs ================= */
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
    // if (!ok) return res.status(401).json({ msg: "Wrong password" });
    if (adminPassword !== school.adminPassword)
      return res.status(401).json({ msg: "Wrong password" });

    const token = jwt.sign(
      { role: "school", schoolCode },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({ token });

  } catch (e) {
    console.error(e);
    res.status(500).json({ msg: "School login failed" });
  }
});

/* ---- REGISTER TEACHER ---- */
app.post("/api/auth/register-teacher", async (req, res) => {
  let { schoolCode, teacherId, password } = req.body;

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

  // await Teacher.create({ schoolCode, teacherId, password: hash });
  await Teacher.create({ schoolCode, teacherId, password });
  res.json({ success: true });
});


/* ---- REGISTER STUDENT ---- */
app.post("/api/auth/register-student", async (req, res) => {
  let { schoolCode, studentId, class: stuClass, name, password } = req.body;

  schoolCode = schoolCode?.trim();
  studentId = studentId?.trim();
  stuClass = stuClass?.trim();
  name = name?.trim();
  password = password?.trim();

  if (!schoolCode || !studentId || !stuClass || !name || !password)
    return res.status(400).json({ msg: "Invalid input" });

  const school = await School.findOne({ schoolCode });
  if (!school) return res.status(400).json({ msg: "Invalid school code" });

  const exists = await Student.findOne({ schoolCode, studentId });

  if (exists) return res.status(400).json({ msg: "Student already exists" });

  // const hash = await bcrypt.hash(password, 10);

  await Student.create({
    schoolCode,
    studentId,
    class: stuClass,
    name,
    password
    // password: hash
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

  // const ok = await bcrypt.compare(password, teacher.password);
  // if (!ok) return res.status(401).json({ msg: "Invalid login" });
  if (password !== teacher.password)
    return res.status(401).json({ msg: "Invalid login" });

  const token = jwt.sign(
    { role: "teacher", schoolCode },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );

  res.json({ token });
});


/* ---- STUDENT LOGIN ---- */
app.post("/api/auth/student-login", async (req, res) => {
  let { schoolCode, studentId, class: stuClass, password } = req.body;

  schoolCode = schoolCode?.trim();
  studentId = studentId?.trim();
  stuClass = stuClass?.trim();
  password = password?.trim();

  const student = await Student.findOne({ schoolCode, studentId, class: stuClass });
  if (!student) return res.status(401).json({ msg: "Invalid login" });

//   const ok = await bcrypt.compare(password, student.password);
// if (!ok) return res.status(401).json({ msg: "Invalid login" });
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

res.json({
  token,
  name: student.name,          // ✅ SEND NAME
  studentId: student.studentId,
  class: student.class
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
        { $set: { password: newPassword }}
      );
      if (!r.matchedCount) return res.status(404).json({ msg: "Student not found" });
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

    if (!student) return res.status(404).json({ msg: "Student not found" });

    res.json({ student });

  } catch (err) {
    console.error("PROFILE ERROR:", err);
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
//     else if (type === "ALL") {

//       prompt = `
// Create a SCHOOL EXAM question paper strictly as per CBSE pattern.

// Class: ${studentClass}
// Subject: ${subject}
// Topic: ${topic}
// Difficulty Level: ${difficulty}

// IMPORTANT FORMAT RULES (FOLLOW STRICTLY):
// - Use ONLY plain text
// - Do NOT use #, ##, ###, *, **, ---, ___, bullets
// - Show topic name at the top in UPPERCASE
// - Use clear SECTION headings (plain text)
// - Proper question numbering (1, 2, 3)
// - Student-friendly language
// - Do NOT mix answers with questions
// - Add a separate ANSWER KEY at the end
// - For Match the Following, show two clear columns
// - All questions must be strictly from given SUBJECT and TOPIC

// Start the paper EXACTLY like this:

// QUESTION PAPER – ${topic.toUpperCase()}

// Then generate around ${count} total questions in following sections:

// SECTION A: MCQs
// SECTION B: True / False
// SECTION C: Fill in the Blanks
// SECTION D: Match the Following
// SECTION E: Descriptive Questions

// DESCRIPTIVE QUESTIONS RULES:
// - Use Explain, Describe, Why, Write a short note
// - Mix short and long answer questions

// MATCH THE FOLLOWING FORMAT (PLAIN TEXT):

// Match the items in Column A with Column B.

// Column A                     Column B
// a) Item from Column A        1) Item from Column B
// b) Item from Column A        2) Item from Column B
// c) Item from Column A        3) Item from Column B
// d) Item from Column A        4) Item from Column B

// After all questions write:

// ANSWER KEY
// and give answers section-wise.
// `;
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
  prompt = `
You are a coding teacher for school students.

Language: ${topic}
Student Class: ${studentClass}
Difficulty: ${difficulty}

STRICT RULES:
- Ask ONLY ONE coding PRACTICE question
- Question MUST match the student class level
- Question MUST match the programming language
- Do NOT include answers
- Do NOT include explanations
- Do NOT include numbering or sections
- Keep language simple and student-friendly

CLASS LEVEL GUIDE:
- Class 1–2: very basic (tags, print text, simple output)
- Class 3–4: small logic, simple structure
- Class 5–6: loops, simple conditions
- Class 7–8: functions, basic logic
- Class 9–12: logic + structure
- Pro: real-world tasks

Return EXACTLY in this format (NO extra text):

QUESTION:
<one clear coding question>

STARTER_CODE:
<starter code if helpful, otherwise leave empty>

EXAMPLES (DO NOT COPY):

HTML:
QUESTION:
Write all heading tags with your name
STARTER_CODE:
<h1></h1>

CSS:
QUESTION:
Change background color to blue
STARTER_CODE:
body {

}

JavaScript:
QUESTION:
Print numbers from 1 to 5
STARTER_CODE:
for(let i=1;i<=5;i++){

}

Python:
QUESTION:
Print your name
STARTER_CODE:
print("")

C:
QUESTION:
Print Hello World
STARTER_CODE:
#include <stdio.h>
int main() {

}

C++:
QUESTION:
Print numbers from 1 to 10
STARTER_CODE:
#include <iostream>
using namespace std;
int main() {

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

//     const response = await openai.responses.create({
//   model: "gpt-4o-mini",   // more compatible
//   input: prompt,
//   temperature: 0.5
// });

// const output =
//   response.output_text ||
//   response.output?.[0]?.content?.[0]?.text ||
//   "";
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

// ======================================================================

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

/* ================= ✅ SCHOOL TEACHER UPLOAD PDF ================= */

app.post("/api/uploadExam", uploadExamPDF.single("pdf"), (req, res) => {
  try {
    const fileUrl = `/exam_uploads/${req.file.filename}`;
    const meta = JSON.parse(req.body.meta || "{}");

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

    console.log("✅ School exam added. Total:", allExams.length);

    res.json({ success: true, exam: newExam });

  } catch (err) {
    console.error("UPLOAD ERROR:", err);
    res.status(500).json({ success: false });
  }
});


/* ================= ✅ STUDENT GET SCHOOL EXAM ================= */

app.get("/api/allExams", (req, res) => {
  res.json(allExams);
});

/* ================= ✅ STUDENT GET delete EXAM pdf================= */
app.delete("/api/deleteExam/:id", (req, res) => {
  const id = Number(req.params.id);

  const exam = allExams.find(e => e.id === id);
  if (!exam) return res.json({ success: false });

  // ✅ DELETE PDF FILE
  const filePath = path.join(__dirname, exam.url);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }

  // ✅ DELETE FROM LIST
  allExams = allExams.filter(e => e.id !== id);

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

/* ================= STATIC FILE SERVING ================= */

app.use("/exam_uploads", express.static(examUploadDir));
app.use("/olympiad_uploads", express.static(olympiadUploadDir));

/* ================= SERVER ================= */

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log("Server running on", PORT));
