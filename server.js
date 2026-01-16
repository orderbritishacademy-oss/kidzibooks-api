const express = require("express");
const cors = require("cors");
const OpenAI = require("openai");

/* ✅ NEW FOR PDF UPLOAD */
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

/* ================= PDF STORAGE ================= */

const uploadDir = "uploads";
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

const storage = multer.diskStorage({
  destination: uploadDir,
  filename: (req, file, cb) => {
    cb(null, Date.now() + "_" + file.originalname);
  }
});

const upload = multer({ storage });

let currentExam = null; // 🔥 shared for all students

/* ================= TEST ================= */

app.get("/", (req, res) => {
  res.send("Kidzibooks API is running");
});

/* ================= AI QUESTION GENERATOR ================= */

app.post("/api/generate", async (req, res) => {
  try {
    // ✅ ADDED subject + studentClass
    const { studentClass, subject, topic, difficulty, type, count } = req.body;

    if (!studentClass || !subject || !topic || !difficulty || !type || !count) {
      return res.status(400).json({ success: false });
    }

    let prompt = "";

    if (type === "ALL") {
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

/* ================= ✅ TEACHER UPLOAD PDF ================= */

app.post("/api/uploadExam", upload.single("pdf"), (req, res) => {
  try {
    const fileUrl = `/uploads/${req.file.filename}`;
    const meta = JSON.parse(req.body.meta || "{}");

    currentExam = {
      name: req.file.originalname,
      url: fileUrl,
      questions: meta.questions || [],
      answers: meta.answers || {}
    };

    console.log("✅ Questions:", currentExam.questions.length);
    console.log("✅ Answers:", Object.keys(currentExam.answers).length);

    res.json({ success: true, exam: currentExam });

  } catch (err) {
    console.error("UPLOAD ERROR:", err);
    res.status(500).json({ success: false });
  }
});

/* ================= ✅ STUDENT GET CURRENT EXAM ================= */

app.get("/api/currentExam", (req, res) => {
  res.json(currentExam);
});

/* ================= ✅ SERVE PDF FILE ================= */

app.use("/uploads", express.static(path.join(__dirname, "uploads")));

/* ================= SERVER ================= */

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log("Server running on", PORT));
