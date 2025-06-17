const express = require('express');
const amqp = require('amqplib');
const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(express.json());

const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672';
const MONGO_URL = process.env.MONGO_URL || 'mongodb://localhost:27017/translationdb';
const QUEUE_NAME = 'translation_requests';

mongoose.connect(MONGO_URL, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

const translationSchema = new mongoose.Schema({
  requestId: { type: String, unique: true, required: true },
  status: { type: String, enum: ['queued', 'processing', 'completed', 'failed'], required: true },
  originalText: { type: String, required: true },
  translatedText: { type: String, default: null },
  targetLanguage: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

const TranslationRequest = mongoose.model('TranslationRequest', translationSchema);

let channel;

async function connectRabbitMQ() {
  try {
    const connection = await amqp.connect(RABBITMQ_URL);
    channel = await connection.createChannel();
    await channel.assertQueue(QUEUE_NAME, { durable: true });
    console.log('Conectado ao RabitMQ');
  } catch (error) {
    console.error('Falha ao conectar no RabitMQ', error);
    setTimeout(connectRabbitMQ, 5000);
  }
}

connectRabbitMQ();

app.post('/translations', async (req, res) => {
  const { text, targetLanguage } = req.body;
  if (!text || !targetLanguage) {
    return res.status(400).json({ error: 'texto e linguagem são necessários' });
  }

  const requestId = uuidv4();

  const translationRequest = new TranslationRequest({
    requestId,
    status: 'queued',
    originalText: text,
    targetLanguage,
  });

  try {
    await translationRequest.save();

    const message = {
      requestId,
      text,
      targetLanguage,
    };

    channel.sendToQueue(QUEUE_NAME, Buffer.from(JSON.stringify(message)), {
      persistent: true,
    });

    res.status(202).json({
      message: 'Requisição de tradução em queued',
      requestId,
      status: 'queued',
    });
  } catch (error) {
    console.error('Erro ao processar a requisição', error);
    res.status(500).json({ error: 'Erro interno' });
  }
});

app.get('/translations/:requestId', async (req, res) => {
  const { requestId } = req.params;

  try {
    const translationRequest = await TranslationRequest.findOne({ requestId });

    if (!translationRequest) {
      return res.status(404).json({ error: 'Requisição não encontrada' });
    }

    res.json({
      requestId: translationRequest.requestId,
      status: translationRequest.status,
      originalText: translationRequest.originalText,
      translatedText: translationRequest.translatedText,
      targetLanguage: translationRequest.targetLanguage,
      createdAt: translationRequest.createdAt,
      updatedAt: translationRequest.updatedAt,
    });
  } catch (error) {
    console.error('Error fetching translation request', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
console.log(`API de tradução escutando a porta: ${PORT}`);
});
