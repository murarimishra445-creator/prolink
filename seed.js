const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');

const db = new sqlite3.Database('./prolink.db');

async function seed() {
  console.log('🌱 Seeding database...');

  // ── CREATE 10 FAKE USERS ──────────────────────────────────────
  const users = [
    { name: 'Rahul Sharma',    email: 'rahul@demo.com',   headline: 'Full Stack Developer at TCS',         location: 'Mumbai, India' },
    { name: 'Priya Patel',     email: 'priya@demo.com',   headline: 'UI/UX Designer at Infosys',           location: 'Bangalore, India' },
    { name: 'Arjun Mehta',     email: 'arjun@demo.com',   headline: 'Data Scientist at Google',            location: 'Hyderabad, India' },
    { name: 'Sneha Reddy',     email: 'sneha@demo.com',   headline: 'Product Manager at Flipkart',         location: 'Pune, India' },
    { name: 'Vikram Singh',    email: 'vikram@demo.com',  headline: 'DevOps Engineer at Amazon',           location: 'Delhi, India' },
    { name: 'Ananya Iyer',     email: 'ananya@demo.com',  headline: 'Frontend Developer at Zomato',        location: 'Chennai, India' },
    { name: 'Rohan Gupta',     email: 'rohan@demo.com',   headline: 'Backend Engineer at Razorpay',        location: 'Bangalore, India' },
    { name: 'Kavya Nair',      email: 'kavya@demo.com',   headline: 'Machine Learning Engineer at Wipro',  location: 'Kochi, India' },
    { name: 'Aditya Kumar',    email: 'aditya@demo.com',  headline: 'Mobile Developer at Paytm',           location: 'Noida, India' },
    { name: 'Divya Menon',     email: 'divya@demo.com',   headline: 'Cloud Architect at Microsoft',        location: 'Gurgaon, India' },
  ];

  const password = await bcrypt.hash('password123', 10);

  for (const user of users) {
    await new Promise((resolve) => {
      db.run(
        `INSERT OR IGNORE INTO users (name, email, password, headline, location, about) VALUES (?, ?, ?, ?, ?, ?)`,
        [user.name, user.email, password, user.headline, user.location,
         `Hi! I am ${user.name}. ${user.headline}. Passionate about technology and innovation.`],
        resolve
      );
    });
  }
  console.log('✅ 10 users created');

  // ── CREATE POSTS ─────────────────────────────────────────────
  const posts = [
    { email: 'rahul@demo.com',   content: '🚀 Just deployed my first microservices architecture using Docker and Kubernetes. The learning curve was steep but totally worth it! #DevOps #CloudComputing' },
    { email: 'priya@demo.com',   content: '✨ Redesigned our entire onboarding flow and reduced drop-off rate by 40%! Good UX really does make a difference. #UIDesign #ProductDesign' },
    { email: 'arjun@demo.com',   content: '📊 Interesting finding — our ML model accuracy jumped from 87% to 94% just by cleaning the training data properly. Garbage in, garbage out! #MachineLearning #DataScience' },
    { email: 'sneha@demo.com',   content: '🎯 Just wrapped up our Q4 product roadmap. Excited about what we are building next year. Lots of AI features coming! #ProductManagement #Innovation' },
    { email: 'vikram@demo.com',  content: '⚡ Pro tip: Use lazy loading and code splitting in React to reduce your bundle size by up to 60%. Your users will thank you! #React #WebPerformance' },
    { email: 'ananya@demo.com',  content: '🌟 3 years at Zomato today! From intern to senior developer. Grateful for every challenge and every teammate. #Gratitude #CareerGrowth' },
    { email: 'rohan@demo.com',   content: '💡 We just open sourced our internal rate limiting library. Check it out on GitHub! Built with Node.js and Redis. #OpenSource #NodeJS' },
    { email: 'kavya@demo.com',   content: '🤖 Finished reading "Designing Machine Learning Systems" by Chip Huyen. Highly recommend it for anyone building production ML systems! #Books #MachineLearning' },
    { email: 'aditya@demo.com',  content: '📱 React Native vs Flutter in 2024 — after building apps in both, I genuinely think Flutter has the edge for performance. Controversial opinion? #MobileDev' },
    { email: 'divya@demo.com',   content: '☁️ Just got my AWS Solutions Architect Professional certification! 3 months of studying but absolutely worth it. #AWS #CloudComputing #Certification' },
    { email: 'rahul@demo.com',   content: '💬 Hot take: Writing clean code is more important than writing clever code. Readability > Cleverness. Agree or disagree? #CleanCode #SoftwareEngineering' },
    { email: 'priya@demo.com',   content: '🎨 Dark mode is not just a trend — studies show it reduces eye strain by 35% for users who work more than 6 hours a day. #UXResearch #Accessibility' },
  ];

  for (const post of posts) {
    const user = await new Promise((resolve) => {
      db.get(`SELECT id FROM users WHERE email = ?`, [post.email], (err, row) => resolve(row));
    });
    if (user) {
      await new Promise((resolve) => {
        db.run(
          `INSERT INTO posts (user_id, content) VALUES (?, ?)`,
          [user.id, post.content],
          resolve
        );
      });
    }
  }
  console.log('✅ 12 posts created');

  // ── CREATE EXPERIENCES ────────────────────────────────────────
  const experiences = [
    { email: 'rahul@demo.com',  title: 'Full Stack Developer',     company: 'TCS',       duration: 'Jan 2022 – Present',   description: 'Building scalable web applications using React and Node.js' },
    { email: 'rahul@demo.com',  title: 'Junior Developer',         company: 'Wipro',     duration: 'Jun 2020 – Dec 2021',  description: 'Worked on enterprise Java applications' },
    { email: 'priya@demo.com',  title: 'UI/UX Designer',           company: 'Infosys',   duration: 'Mar 2021 – Present',   description: 'Leading design for 3 major product lines' },
    { email: 'arjun@demo.com',  title: 'Data Scientist',           company: 'Google',    duration: 'Aug 2021 – Present',   description: 'Building recommendation systems at scale' },
    { email: 'sneha@demo.com',  title: 'Product Manager',          company: 'Flipkart',  duration: 'Feb 2020 – Present',   description: 'Managing the seller experience product' },
    { email: 'vikram@demo.com', title: 'DevOps Engineer',          company: 'Amazon',    duration: 'Nov 2019 – Present',   description: 'Managing CI/CD pipelines and AWS infrastructure' },
    { email: 'ananya@demo.com', title: 'Frontend Developer',       company: 'Zomato',    duration: 'Jul 2021 – Present',   description: 'Building the consumer-facing web app' },
    { email: 'rohan@demo.com',  title: 'Backend Engineer',         company: 'Razorpay',  duration: 'Sep 2020 – Present',   description: 'Working on payment gateway APIs' },
    { email: 'kavya@demo.com',  title: 'ML Engineer',              company: 'Wipro',     duration: 'Jan 2022 – Present',   description: 'Developing NLP models for enterprise clients' },
    { email: 'aditya@demo.com', title: 'Mobile Developer',         company: 'Paytm',     duration: 'Apr 2021 – Present',   description: 'Building the Paytm mobile app in React Native' },
    { email: 'divya@demo.com',  title: 'Cloud Architect',          company: 'Microsoft', duration: 'Oct 2018 – Present',   description: 'Designing cloud solutions for enterprise customers' },
  ];

  for (const exp of experiences) {
    const user = await new Promise((resolve) => {
      db.get(`SELECT id FROM users WHERE email = ?`, [exp.email], (err, row) => resolve(row));
    });
    if (user) {
      await new Promise((resolve) => {
        db.run(
          `INSERT INTO experiences (user_id, title, company, duration, description) VALUES (?,?,?,?,?)`,
          [user.id, exp.title, exp.company, exp.duration, exp.description],
          resolve
        );
      });
    }
  }
  console.log('✅ Experiences created');

  // ── CREATE CONNECTIONS ────────────────────────────────────────
  const connectionPairs = [
    ['rahul@demo.com',  'priya@demo.com'],
    ['rahul@demo.com',  'arjun@demo.com'],
    ['priya@demo.com',  'sneha@demo.com'],
    ['arjun@demo.com',  'vikram@demo.com'],
    ['sneha@demo.com',  'ananya@demo.com'],
    ['vikram@demo.com', 'rohan@demo.com'],
    ['kavya@demo.com',  'aditya@demo.com'],
    ['divya@demo.com',  'rahul@demo.com'],
  ];

  for (const [emailA, emailB] of connectionPairs) {
    const userA = await new Promise((resolve) => {
      db.get(`SELECT id FROM users WHERE email = ?`, [emailA], (err, row) => resolve(row));
    });
    const userB = await new Promise((resolve) => {
      db.get(`SELECT id FROM users WHERE email = ?`, [emailB], (err, row) => resolve(row));
    });
    if (userA && userB) {
      await new Promise((resolve) => {
        db.run(
          `INSERT OR IGNORE INTO connections (requester_id, receiver_id, status) VALUES (?,?,'accepted')`,
          [userA.id, userB.id],
          resolve
        );
      });
    }
  }
  console.log('✅ Connections created');

  console.log('');
  console.log('🎉 Database seeded successfully!');
  console.log('');
  console.log('👤 All demo accounts use password: password123');
  console.log('📧 Example login: rahul@demo.com / password123');
  console.log('');

  db.close();
}

seed();