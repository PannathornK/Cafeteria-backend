const express = require('express');
const app = express();
const mongoose = require('mongoose');

mongoose.connect('mongodb://localhost:27017', {
    dbName: 'changDB',
    useNewUrlParser: true,
    useUnifiedTopology: true,
    connectTimeoutMS: 30000,
})
.then(() => console.log("Connected to DB"))
.catch((err) => console.log(err));

const MenuSchema = new mongoose.Schema({
    menuname: {
        type: String,
    },
    price: {
        type: Number,
    },
    weekly_sell: {
        type: Number,
    },
    topmenu_sell_week: {
        type: String,
    },
    optional: {
        type: String,
    }
})

const Menu = mongoose.model("menus", MenuSchema);

Menu.createIndexes();

app.use(express.json());

app.get('/', (req, res) => {
    res.send('app is running');
});

// app.get("/menus", async (req, res) => {
//     try {
//         const menus = await Menu.find();
//         res.send(menus);
//     } catch (err) {
//         console.error(err);
//         res.status(500).send("Can't Find Item");
//     }
// })

app.get("/menus", async (req, res) => {
    try {
        const menu = 
            [
                {
                    "menuname": "fried rice",
                    "price": 40
                },
                {
                    "menuname": "steak",
                    "price": 40
                }
            ]
        res.send(menu);
    } catch (err) {
        console.error(err);
        res.status(500).send("Can't Find Item");
    }
})
app.post("/addMenu", async (req, res) => {
    try{
        const menu = new Menu(req.body);
        let result = await menu.save();
        result = result.toObject();
        if (result) {
            res.send(result)
        } else {
            console.log("Can't add menu");
        }
    } catch (e) {
        console.log(e);
        res.send({status: "Something went wrong"});
    }
})

app.listen(3000, () => {
    console.log('Application is running on port 3000');
})