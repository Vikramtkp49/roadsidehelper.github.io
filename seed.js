require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const Admin = require('./Admin');
const Mechanic = require('./Mechanic');
const AssistanceRequest = require('./AssistanceRequest');

const skills = ['Engine Repair', 'Tyre Change', 'Battery Jump', 'Towing', 'Oil Change', 'Brake Repair', 'AC Repair', 'Electrical'];
const cities = ['Chennai', 'Coimbatore', 'Madurai', 'Trichy', 'Salem', 'Tirunelveli', 'Vellore', 'Tuticorin'];
const vehicles = ['Honda Activa', 'Royal Enfield', 'Maruti Swift', 'Hyundai Creta', 'Tata Nexon', 'Mahindra XUV700', 'Toyota Innova'];
const problems = ['Engine won\'t start', 'Flat tyre / Puncture', 'Battery dead', 'Car overheating', 'Brake failure', 'AC not working', 'Fuel delivery needed'];
const statuses = ['pending', 'assigned', 'completed', 'cancelled'];

function randomItem(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function randomInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function randomDate(daysAgo) {
    const d = new Date();
    d.setDate(d.getDate() - randomInt(0, daysAgo));
    return d;
}

async function seed() {
    try {
        const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/mechanic';
        await mongoose.connect(mongoUri);
        console.log('✅ Connected to MongoDB');

        // Clear existing data
        await Admin.deleteMany({});
        await Mechanic.deleteMany({});
        await AssistanceRequest.deleteMany({});
        console.log('🗑️ Cleared existing data');

        // Create Default Admin
        const hashedPassword = await bcrypt.hash('Admin@123', 10);
        const admin = await Admin.create({
            name: 'System Admin',
            email: 'admin@roadside-helper.com',
            password: hashedPassword,
            role: 'super_admin',
            permissions: ['view_requests', 'approve_mechanics', 'block_mechanics', 'edit_requests', 'view_analytics', 'manage_admins', 'manage_settings']
        });
        console.log(`👤 Admin created: ${admin.email}`);

        // Create 20 Mechanics
        const mechanicDocs = [];
        for (let i = 1; i <= 20; i++) {
            const city = randomItem(cities);
            const mobile = `98${randomInt(10000000, 99999999)}`;
            const mechPass = await bcrypt.hash(`Pass@${mobile}`, 10);
            mechanicDocs.push({
                name: `Mechanic ${i}`,
                email: `mechanic${i}@example.com`,
                mobile: mobile,
                password: mechPass,
                address: `${randomInt(1, 99)} Main Road, ${city}`,
                location: { 
                    latitude: 13.0827 + (Math.random() - 0.5) * 0.1, 
                    longitude: 80.2707 + (Math.random() - 0.5) * 0.1 
                },
                vehicle_type: i % 3 === 0 ? 'Bike' : i % 3 === 1 ? 'Car' : 'Both',
                specialization: randomItem(skills),
                shop_image: 'default-shop.jpg',
                isVerified: i <= 14,
                isBlocked: i === 20,
                backgroundCheckStatus: i <= 12 ? 'verified' : i <= 16 ? 'pending' : 'rejected',
                rating: parseFloat((Math.random() * 2 + 3).toFixed(1)),
                totalJobs: randomInt(10, 120),
                experience: randomInt(1, 15),
                skills: [randomItem(skills), randomItem(skills)].filter((v, idx, a) => a.indexOf(v) === idx)
            });
        }
        const mechanics = await Mechanic.insertMany(mechanicDocs);
        console.log(`🔧 Created ${mechanics.length} mechanics`);

        // Create 50 Assistance Requests
        const requestDocs = [];
        for (let i = 1; i <= 50; i++) {
            const status = randomItem(statuses);
            requestDocs.push({
                name: `Customer ${i}`,
                phone: `70${randomInt(10000000, 99999999)}`,
                location: { 
                    latitude: 13.0827 + (Math.random() - 0.5) * 0.2, 
                    longitude: 80.2707 + (Math.random() - 0.5) * 0.2 
                },
                vehicle: randomItem(['Bike', 'Car', 'Load Van']),
                needs: randomItem(problems),
                image: 'default-request.jpg',
                status,
                createdAt: randomDate(30)
            });
        }
        await AssistanceRequest.insertMany(requestDocs);
        console.log(`📋 Created 50 assistance requests`);

        console.log('\n✅ Seed complete!');
        console.log(`\n🔑 Admin Login credentials:\n   Email: admin@roadside-helper.com\n   Password: Admin@123`);
        process.exit(0);
    } catch (err) {
        console.error('❌ Seed error:', err);
        process.exit(1);
    }
}

seed();
