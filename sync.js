const { createClient } = require('@supabase/supabase-js');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

// Prende le chiavi dalla cassaforte di GitHub
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const s3 = new S3Client({
  region: "us-east-1", // FIX 1: Inganniamo l'SDK con una region standard AWS
  endpoint: `https://${process.env.CF_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { 
    accessKeyId: process.env.R2_ACCESS_KEY, 
    secretAccessKey: process.env.R2_SECRET_KEY 
  },
  forcePathStyle: true // FIX 2: Impediamo all'SDK di storpiare l'URL di Cloudflare
});

async function run() {
  console.log("Sincronizzazione iniziata...");
  const { data: tracks, error } = await supabase.from('tracks').select('*');
  if (error) throw error;

  // 1. Indice leggero
  const indexData = tracks.map(t => ({ id: t.id, title: t.title, artist: t.artist, album: t.album }));
  await upload("tracks_index.json", indexData);
  console.log("Indice caricato!");

  // 2. File completi
  for (const track of tracks) {
    const fileName = `tracks/${track.title.toLowerCase().replace(/ /g, "_")}.json`;
    const detailedData = {
      ...track,
      audio_url: track.audio_url ? track.audio_url.replace("https://", "https://cdn.statically.io/gh/") : null,
      image_url: track.image_url ? track.image_url.replace("https://", "https://cdn.statically.io/img/") : null,
      artist_img_url: track.artist_img_url ? track.artist_img_url.replace("https://", "https://cdn.statically.io/img/") : null,
    };
    await upload(fileName, detailedData);
  }
  console.log("Fatto! Tutto su Cloudflare.");
}

async function upload(key, body) {
  await s3.send(new PutObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME, Key: key, Body: JSON.stringify(body), ContentType: "application/json"
  }));
}

run();
