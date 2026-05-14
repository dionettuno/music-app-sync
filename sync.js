const { createClient } = require('@supabase/supabase-js');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

const supabase = createClient(
  process.env.SUPABASE_URL.trim(), 
  process.env.SUPABASE_KEY.trim()
);

const s3 = new S3Client({
  region: "us-east-1",
  endpoint: `https://${process.env.CF_ACCOUNT_ID.trim()}.r2.cloudflarestorage.com`,
  credentials: { 
    accessKeyId: process.env.R2_ACCESS_KEY.trim(), 
    secretAccessKey: process.env.R2_SECRET_KEY.trim() 
  },
  forcePathStyle: true
});

// Costanti architetturali
const R2_URL = "pub-bbf8dba715c84578baba8379591abcf0.r2.dev/";
const IMAGE_CDN = "https://images.weserv.nl/?url=";

async function run() {
  console.log("Sincronizzazione iniziata...");
  const { data: tracks, error } = await supabase.from('tracks').select('*');
  if (error) throw error;

  // 1. Creazione dell'indice leggero
  const indexData = tracks.map(t => {
    // Estraiamo in modo chirurgico SOLO il nome del file (es: "foto.jpg")
    let imgFileName = t.image_url ? t.image_url.split('/').pop() : null;
    let artistImgFileName = t.artist_img_url ? t.artist_img_url.split('/').pop() : null; 
    
    return { 
      id: t.id, 
      title: t.title, 
      artist: t.artist, 
      album: t.album,
      tag: t.tag,
      language: t.language,
      // RICOSTRUZIONE PERCORSI: Inseriamo a mano /images/albums/ e /images/artists/
      image_url: imgFileName ? `${IMAGE_CDN}${R2_URL}images/albums/${imgFileName}&w=400&output=webp` : null,
      artist_img_url: artistImgFileName ? `${IMAGE_CDN}${R2_URL}images/artists/${artistImgFileName}&w=400&output=webp` : null 
    };
  });
  
  await upload("tracks_index.json", indexData);
  console.log("Indice caricato!");

  // 2. Creazione dei file JSON dettagliati
  for (const track of tracks) {
    const fileName = `tracks/${track.title.toLowerCase().replace(/ /g, "_")}.json`;
    
    let imgFileName = track.image_url ? track.image_url.split('/').pop() : null;
    let artistImgFileName = track.artist_img_url ? track.artist_img_url.split('/').pop() : null;
    let audioFileName = track.audio_url ? track.audio_url.split('/').pop() : null;

    const detailedData = {
      ...track,
      // Audio prelevato dalla cartella audio/ di R2 (se li tieni sfusi, togli "audio/")
      audio_url: audioFileName ? `https://${R2_URL}audio/${audioFileName}` : null,
      
      // Immagini servite dalla CDN con i percorsi delle sottocartelle esatti
      image_url: imgFileName ? `${IMAGE_CDN}${R2_URL}images/albums/${imgFileName}&w=400&output=webp` : null,
      artist_img_url: artistImgFileName ? `${IMAGE_CDN}${R2_URL}images/artists/${artistImgFileName}&w=400&output=webp` : null,
    };
    await upload(fileName, detailedData);
  }
  console.log("Fatto! Tutto su Cloudflare con i percorsi corretti.");
}

async function upload(key, body) {
  await s3.send(new PutObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME.trim(), 
    Key: key, 
    Body: JSON.stringify(body), 
    ContentType: "application/json"
  }));
}

run();
