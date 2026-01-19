const express = require("express");
const cors = require("cors");
const OpenAI = require("openai");

/* ✅ PDF UPLOAD */
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const app = express();
app.use(cors());
app.use(express.json());

/* ================= OPENAI ================= */

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

/* ================= EXAM DATA FILE ================= */

const dataDir = path.join(__dirname, "data");
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const examDataFile = path.join(dataDir, "currentExam.json");

/* ✅ NEW: OLYMPIAD DATA FILE */
const olympiadDataFile = path.join(dataDir, "currentOlympiadExam.json");

let currentExam = null; // 🔥 School exam
let currentOlympiadExam = null; // 🔥 Olympiad exam (SEPARATE)

/* ===== LOAD SCHOOL EXAM ===== */
if (fs.existsSync(examDataFile)) {
  try {
    const data = fs.readFileSync(examDataFile, "utf-8");
    currentExam = JSON.parse(data);
    console.log("✅ Loaded saved school exam");
  } catch (e) {
    console.log("❌ Failed to load school exam");
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

/* ================= AI QUESTION GENERATOR ================= */

app.post("/api/generate", async (req, res) => {
  try {
    const { studentClass, subject, topic, difficulty, type, count } = req.body;

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
    else if (type === "ALL") {

      prompt = `
Create a SCHOOL EXAM question paper strictly as per CBSE pattern.

Class: ${studentClass}
Subject: ${subject}
Topic: ${topic}
Difficulty Level: ${difficulty}

IMPORTANT FORMAT RULES (FOLLOW STRICTLY):
- Use ONLY plain text
- Do NOT use #, ##, ###, *, **, ---, ___, bullets
- Show topic name at the top in UPPERCASE
- Use clear SECTION headings (plain text)
- Proper question numbering (1, 2, 3)
- Student-friendly language
- Do NOT mix answers with questions
- Add a separate ANSWER KEY at the end
- For Match the Following, show two clear columns
- All questions must be strictly from given SUBJECT and TOPIC

Start the paper EXACTLY like this:

QUESTION PAPER – ${topic.toUpperCase()}

Then generate around ${count} total questions in following sections:

SECTION A: MCQs
SECTION B: True / False
SECTION C: Fill in the Blanks
SECTION D: Match the Following
SECTION E: Descriptive Questions

DESCRIPTIVE QUESTIONS RULES:
- Use Explain, Describe, Why, Write a short note
- Mix short and long answer questions

MATCH THE FOLLOWING FORMAT (PLAIN TEXT):

Match the items in Column A with Column B.

Column A                     Column B
a) Item from Column A        1) Item from Column B
b) Item from Column A        2) Item from Column B
c) Item from Column A        3) Item from Column B
d) Item from Column A        4) Item from Column B

After all questions write:

ANSWER KEY
and give answers section-wise.
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

    const response = await openai.responses.create({
      model: "gpt-4.1-mini",
      input: [
        { role: "system", content: "You are a professional Indian school exam paper setter." },
        { role: "user", content: prompt }
      ],
      temperature: 0.5
    });

    const output = response.output_text;

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

    currentExam = {
      name: req.file.originalname,
      url: fileUrl,
      class: meta.class,
      subject: meta.subject,
      chapter: meta.chapter,
      questions: meta.questions || [],
      answers: meta.answers || {}
    };

    fs.writeFileSync(examDataFile, JSON.stringify(currentExam, null, 2));

    console.log("✅ School exam saved");

    res.json({ success: true, exam: currentExam });

  } catch (err) {
    console.error("UPLOAD ERROR:", err);
    res.status(500).json({ success: false });
  }
});

/* ================= ✅ STUDENT GET SCHOOL EXAM ================= */

app.get("/api/currentExam", (req, res) => {
  res.json(currentExam);
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
