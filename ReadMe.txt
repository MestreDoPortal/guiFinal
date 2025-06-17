-Tradutor utilizando de um tradutor mockado invertendo a frase, exemplos de requisição no postman

Para fazer a requisição de tradução e pegar o id q sera utilizado para fazer o resate da tradução

URL:`http://localhost:3000/translations`
POST
{
  "text": "Ola mundo",
  "targetLanguage": "en"
}

para resgatar a tradução

URL:`http://localhost:3000/translations/{{requestId}}`
GET

exemplo do get esperado
{
  "requestId": "6502c039-e3b2-4a57-8aa9-641b7ffa0f83",
  "status": "completed",
  "originalText": "Hello world",
  "translatedText": "dlrow olleH (es)",
  "targetLanguage": "es",
  "createdAt": "2025-06-17T22:42:41.333Z",
  "updatedAt": "2025-06-17T22:42:41.582Z"
}
