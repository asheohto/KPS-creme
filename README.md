STUFF THAT YOU NEED 
Node.js (do winget install node.js or smth idk)
MongoB Atlas account (free tier is fine)

1. DO npm install ON BOTH ./backend AND ./frontend  DIRECTORY
2. SET UP A MONGODB ACCOOUNT AND GET URI (you should probably ask gemini for a step by step LOL)
3. PUT URI INTO .env FILE ON ./backend (THE VARIABLE SHOULD BE NAMED MONGO_URI, REFER TO index.js ON ./backend)

exp.
MONGO_URI=the_uri_from_mongodb
JWT_SECRET=put_random_numbers_here

4. OPEN 3 TERMINALS
5. cd 2 TERMINAL TO ./backend AND 1 TERMINAL TO ./frontend
6. DO node index.js AND node local-media.js ON ./backend
- index.js (main backend)
- local-media.js (youtubei.js stuff)

7. DO npm run electron:dev ON ./frontend


I SCRAPPED AND PULLED STUFF FROM OLD PROJECTS FOR THIS THING SO THERES SOME STUFF THATS NOT REALLY IMPORTANT IN HERE
