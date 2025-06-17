const amqp = require('amqplib');
const mongoose = require('mongoose');

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

function mockTranslate(text, targetLanguage) {
  // Simple mock translation: reverse the text and append language code
  return text.split('').reverse().join('') + ` (${targetLanguage})`;
}

async function startWorker() {
  try {
    const connection = await amqp.connect(RABBITMQ_URL);
    const channel = await connection.createChannel();
    await channel.assertQueue(QUEUE_NAME, { durable: true });
    channel.prefetch(1);
    console.log('Esperando por texto a traduzir e a TargetLanguage');

    channel.consume(QUEUE_NAME, async (msg) => {
      if (msg !== null) {
        const content = msg.content.toString();
        let message;
        try {
          message = JSON.parse(content);
        } catch (err) {
          console.error('Formato inválido de mensagem', err);
          channel.ack(msg);
          return;
        }

        const { requestId, text, targetLanguage } = message;

        try {
          const translationRequest = await TranslationRequest.findOne({ requestId });
          if (!translationRequest) {
            console.error(`ID ${requestId} não encontrado`);
            channel.ack(msg);
            return;
          }

          translationRequest.status = 'processing';
          translationRequest.updatedAt = new Date();
          await translationRequest.save();

          // Perform mock translation
          const translatedText = mockTranslate(text, targetLanguage);

          translationRequest.translatedText = translatedText;
          translationRequest.status = 'completed';
          translationRequest.updatedAt = new Date();
          await translationRequest.save();

          console.log(`ID processada: ${requestId}`);

          channel.ack(msg);
        } catch (error) {
          console.error('Erro processando mensagem', error);
          try {
            const translationRequest = await TranslationRequest.findOne({ requestId });
            if (translationRequest) {
              translationRequest.status = 'failed';
              translationRequest.updatedAt = new Date();
              await translationRequest.save();
            }
          } catch (e) {
            console.error('Error updating failed status', e);
          }
          channel.ack(msg);
        }
      }
    }, { noAck: false });
  } catch (error) {
    console.error('Worker error', error);
    setTimeout(startWorker, 5000);
  }
}

startWorker();
