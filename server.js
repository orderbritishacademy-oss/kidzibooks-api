const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.send("Kidzibooks API is running");
});

app.post("/api/generate", (req, res) => {
  const { topic, count } = req.body;

  const questions = [];
  for (let i = 1; i <= (count || 5); i++) {
    questions.push({
      question: `Question ${i} on ${topic}`,
      answer: `Answer ${i}`
    });
  }

  res.json({ success: true, questions });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log("Server running on", PORT));
