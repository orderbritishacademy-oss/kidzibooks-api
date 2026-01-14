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

/* ================= PDF STORAGE ================= */

const uploadDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

const storage = multer.diskStorage({
  destination: uploadDir,
  filename: (req, file, cb) => {
    cb(null, Date.now() + "_" + file.originalname);
  }
});

const upload = multer({ storage });

/* 🔥 ONLY ONE EXAM STORAGE */
let exams = [];

/* ================= TEST ================= */

app.get("/", (req, res) => {
  res.send("Kidzibooks API is running");
});

/* ================= AI QUESTION GENERATOR ================= */

app.post("/api/generate", async (req, res) => {
  try {
    const { topic, difficulty, type, count } = req.body;

    if (!topic || !difficulty || !type || !count) {
      return res.status(400).json({ success: false });
    }

    let prompt = "";

    if (type === "ALL") {
      prompt = `
Create a student-level question paper.

IMPORTANT FORMAT RULES (FOLLOW STRICTLY):
- Use ONLY plain text
- Do NOT use #, ##, ###, *, **, ---, ___, bullets
- Show the topic name at the top in UPPERCASE
- Use clear SECTION headings (plain text)
- Proper question numbering (1, 2, 3)
- Student-friendly language
- Do NOT mix answers with questions
- Add a separate ANSWER KEY at the end
- For Match the Following, show two clear columns

Start the paper EXACTLY like this:

QUESTION PAPER – ${topic.toUpperCase()}

Then generate ${count} questions in EACH section:

SECTION A: MCQs
SECTION B: True / False
SECTION C: Fill in the Blanks
SECTION D: Match the Following
SECTION E: Descriptive Questions
`;
    } else {
      prompt = `
Create a student-level question paper.

IMPORTANT FORMAT RULES (FOLLOW STRICTLY):
- Use ONLY plain text
- Do NOT use #, ##, ###, *, **, ---, ___, bullets
- Show the topic name at the top in UPPERCASE
- Always start with a SECTION heading
- Proper numbering (1, 2, 3)
- Student-friendly language
- Do NOT mix answers with questions
- Add a separate ANSWER KEY at the end

Start the paper EXACTLY like this:

QUESTION PAPER – ${topic.toUpperCase()}

SECTION: ${type}

Then generate ${count} questions under this section.
`;
    }

    const response = await openai.responses.create({
      model: "gpt-4.1-mini",
      input: [
        { role: "system", content: "You are a professional school exam paper setter." },
        { role: "user", content: prompt }
      ],
      temperature: 0.6
    });

    const output = response.output_text;

    res.json({ success: true, result: output });

  } catch (err) {
    console.error("OPENAI ERROR:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/* ================= ✅ UPLOAD EXAM ================= */

app.post("/api/uploadExam", upload.single("pdf"), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, msg: "No file uploaded" });
    }

    const fileUrl = `/uploads/${req.file.filename}`;
    const meta = JSON.parse(req.body.meta || "{}");

    // 🔥 DELETE OLD FILE IF EXISTS
    if (exams.length > 0 && exams[0].url) {
      const oldPath = path.join(__dirname, exams[0].url);
      if (fs.existsSync(oldPath)) {
        fs.unlinkSync(oldPath);
      }
    }

    const exam = {
      id: Date.now(),
      name: req.file.originalname,
      url: fileUrl,
      questions: meta.questions || [],
      answers: meta.answers || {}
    };

    // 🔥 KEEP ONLY ONE EXAM
    exams = [exam];

    res.json({ success: true, exam });

  } catch (err) {
    console.error("UPLOAD ERROR:", err);
    res.status(500).json({ success: false });
  }
});

/* ================= ✅ GET EXAMS ================= */

app.get("/api/exams", (req, res) => {
  res.json(exams);
});

/* ================= ✅ DELETE EXAM ================= */

app.delete("/api/deleteExam", (req, res) => {
  try {
    if (exams.length > 0 && exams[0].url) {
      const filePath = path.join(__dirname, exams[0].url);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }

    exams = [];
    res.json({ success: true });

  } catch (err) {
    console.error("DELETE ERROR:", err);
    res.status(500).json({ success: false });
  }
});

/* ================= SERVE PDF ================= */

app.use("/uploads", express.static(uploadDir));

/* ================= SERVER ================= */

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log("Server running on", PORT));
