import express from "express";
import bodyParser from "body-parser";
import fetch from "node-fetch";
import twilio from "twilio";

const app = express();
const { MessagingResponse } = twilio.twiml;
// Middleware obligatoire pour Twilio
app.use(bodyParser.urlencoded({extended: false }));

const PORT = process.env.PORT || 3000;
const GOOGLE_SHEETS_WEBHOOK_URL=process.env.GOOGLE_SHEETS_WEBHOOK_URL;

// =======================================
// STATE MACHINE
// =======================================
const sessions = new Map();

function getSession(phone) {
    if (!sessions.has(phone)) {
        sessions.set(phone, {step: 0});
    }
    return sessions.get(phone);
}

function resetSession(phone) {
    sessions.delete(phone);
}
// =====================================
// HELPERS
// =====================================
async function sendToGoogleSheets(payload) {
    if (!GOOGLE_SHEETS_WEBHOOK_URL) return;

    try{
        await fetch(GOOGLE_SHEETS_WEBHOOK_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
    } catch (err) {
        console.error("Google Sheets error:", err.message);
    }
}



// ============================================
// WEBHOOK TWILIO
// ============================================================
app.post("/whatsapp/webhook", async (req, res) => {
  const twiml = new MessagingResponse();

  const from = req.body.From; // whatsapp +243...
  const body = (req.body.Body || "").trim();
  const phone = from.replace("whatsapp:", "");
  const text = body.toLowerCase();

  console.log("Incoming:", phone, body);

  // cancel anytime

  if (text === "annuler") {
    resetSession(phone);
    twiml.message("Votre demande a été annulée. Si vous souhaitez effectuer une nouvelle réservation, il vous suffit de m'écrire à nouveau.  Je reste à votre disposition");
    return res.type("text/xml").send(twiml.toString());
  }
  
  const session = getSession(phone);
  switch (session.step) {
    // STEP 0 __ GREETING
    case 0:
        twiml.message(
            "Bonjour et bienvenue chez IMANNI. Je suis votre assistante de prise de rendez-vous. Je vais vous accompager en quelques instants.\n"+
            "Quel service souhaitez-vous ?\n" + 
            "1.Restaurant\n2.Hotel\n3.Spa\n\n" +
            "Merci de répondre par le numéro correspondant."
          
        );
        session.step = 1;
        break;
        // STEP 1 -- SERVICE
        case 1:
            if (!["1", "2", "3"].includes(body)) {
                twiml.message("Merci de répondre par *1*, *2*, ou *3*.");
                break;
            }
            session.service = 
            body === "1" ? "Restaurant" :
            body === "2" ? "Hotel": "Spa";

            twiml.message(
                `Parfait pour le service *${session.service}*.\n` +
                "Quelle date et heure souhaitez-vous ?\n" +
                "Exemple : 14 février à  14h"
            );
            session.step = 2;
            break;

            // STEP 2 --DATE
            case 2:
                session.date_time = body;
                twiml.message("Puis-je avoir votre nom complet, s'il vous plait ?");
                session.step = 3;
                break;
            
            // STEP 3 -- CONFIRRMATION
            case 3:
                session.name = body;

                const appointment = {
                    service: session.service,
                    date_time: session.date_time,
                    name: session.name,
                    phone,
                    source: "whatsapp",
                    created_at: new Date().toISOString()
                };
                await sendToGoogleSheets(appointment);
                twiml.message(
                    " *Votre demande a été bien enregistrée avec les details suivants:*\n\n" +
                    `Service : ${appointment.service}\n` +      
                    `Date : ${appointment.date_time}\n` +
                    `Nom : ${appointment.name}\n\n` +
                    "Votre rendez-vous est confirmé. " +
                    "Nous avons hate de vous acceuillir chez IMANNI " +
                    "A très bientot !!!"
                );
                resetSession(phone);
                break;

            default:
                resetSession(phone);
                twiml.message("Je vous remercie pour votre message. Afin de mieux vous assister, pourriez-vous me préciser votre demande? je suis là pour vous aider.");
  }
  res.type("text/xml").send(twiml.toString());
});


// ===========================================================
// HEALTH CHECK
// ===========================================================

app.get("/health", (_req, res) => {
  res.json({ status: "ok", uptime: process.uptime() });
});

// ====================================================================
// START SERVER
// =======================================================================

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

    
        






