# TerraTwin: find Earth's twins of Mars and Moon landscapes

## What we built

TerraTwin is a free web app with a small machine-learning pipeline behind it. It finds places on Earth that look like places on Mars and the Moon.

You give it a picture. That can be a Mars rover photo, a lunar photo or any landscape photo. TerraTwin then compares it with real satellite pictures from around the world and marks the most similar places as flags on a 3D globe:

- **Red flags:** the 3 closest matches
- **Orange flags:** the next 5
- **Yellow flags:** the next 10

Click a flag and you see a real satellite picture of that place next to your picture. Below the pictures is a simple table of five features: colour, brightness, light-and-shadow mix, contrast and surface texture. For each feature it shows the value in your picture, the value at that place and how closely they match. The card also says what the place is **best at** and where it is **weakest**, so you can see why it matched instead of just getting a number.

Behind the picture search sits a terrain dataset and two saved models:

1. **Terrain dataset.** We built 9,680 terrain tiles from elevation maps and measured slope, roughness, relief and brightness for each one:
   - 7,180 tiles from Egypt's Western Desert (SRTM, 30 m)
   - 900 tiles from Mars around Jezero Crater, where the Perseverance rover is working (HRSC/MOLA, 200 m)
   - 1,600 tiles from the Moon's south pole (LOLA, 118 m)
2. **Fair-comparison check.** The three bodies were mapped at different resolutions, so we tested whether their tiles can honestly be compared. We trained a classifier to tell Earth tiles from Mars or Moon tiles. After calibration, the Mars score (AUC) dropped from 1.000 to 0.911, so Mars comparisons became meaningfully closer. The Moon score stayed at 0.999, so the app treats Moon terrain comparisons as not yet reliable instead of hiding the problem.
3. **Landform model.** This model sorts Earth terrain into four types: escarpment, coarse fan, deltaic plain and hardpan flat. On held-out map areas it is 99.6% accurate, against 50% for a simple guess.
4. **Site-quality model.** This model scores how suitable a site is as a rover-style test area (gentle slopes, workable roughness). It reproduces our scoring rule with R² = 0.996. Farmland and towns were found with satellite imagery and removed (82 tiles).
5. **Worldwide picture library.** The library holds 720 real cloud-free satellite pictures (Sentinel-2 cloudless 2023) across 177 countries and areas. This lets the search cover the whole world, not only Egypt.
6. **Real Mars examples.** The app includes nine sampling sites from the Perseverance Initial Reports (Volumes 2 and 4), such as Skinner Ridge, Wildcat Ridge and Beaver Falls, as ready-to-try examples.

## The problem it addresses

Before rovers and astronauts go to the Moon or Mars, teams test equipment, train crews and study geology at **analogue sites**: places on Earth that resemble the target location. Choosing these sites today depends heavily on expert knowledge and on scattered datasets that are hard to compare. For a student, teacher or small research team, "Where on Earth looks like this place on Mars?" is a hard question to answer.

## How it helps and why it matters

- **Fast and visual.** Anyone can upload a photo and get a ranked list of candidate places on a globe within seconds.
- **Explainable.** Every result shows which features matched and how well, side by side with a real picture of the place. Users can judge the result themselves instead of trusting a black box.
- **Honest about limits.** The scores measure visual similarity; they are not an exact location. Satellite pictures are taken from above while rover photos are taken from the side, and the worldwide library is a sample, not every place on Earth. The app says this openly.
- **Private.** Uploaded photos are processed in the browser and are never sent to a server.
- **Open.** The code, data exports, saved models and reports are on GitHub, so others can check the work, add new regions or data, and improve the models.

Good analogue sites make field tests cheaper and safer, help choose realistic training grounds, and make planetary science easier to teach. TerraTwin turns that search into something anyone can explore.

**Next step:** train a learned photo-to-place model on the labelled image data the team is now collecting, and judge it fairly by testing on regions it never saw during training.
