require('dotenv').config();

const express = require('express');
const http = require('http');
const mysql = require("mysql");
const bodyParser = require('body-parser')
const WebSocket = require('ws');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(bodyParser.json());
app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    next();
  });
wss.on('connection', (ws) => {
    console.log("client connected")
    ws.on('message', (message) => {
        wss.clients.forEach((client) => {
            if (client !== ws && client.readyState === WebSocket.OPEN) {
                client.send(message.toString());
            }
        })
    })
})

// db config
const db = mysql.createConnection({
    host: process.env.MYSQL_HOST,
    port: process.env.MYSQL_PORT,
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE,
});

// connect to db
db.connect((err) => {
    if (err) throw err;
})

// add menu
app.post('/addMenu', (req, res) => {
    const {menu_name, menu_picture, price, weekly_sell, topmenu_sell_week} = req.body
    const menu = [[menu_name, menu_picture, price, weekly_sell, topmenu_sell_week]]
    db.query(
        `INSERT INTO menus (menu_name, menu_picture, price, weekly_sell, topmenu_sell_week)
         VALUES ?`, [menu], (err, result) => {
        if (err) {
            res.status(500).send("Error creating menu");
        } else {
            res.send('menu added')
        }
    })
})

// get all menu
app.get('/getMenu', (req, res) => {
    db.query("SELECT * FROM menus", (err, result) => {
        if (err) throw err;
        var data = JSON.parse(JSON.stringify(result));
        res.send(data)
    })
    // res.send("ok")
})

// get optional by menu_id
app.get('/getOptionalByMenuId', (req, res) => {
    const menu_id = req.body.menu_id
    db.query("SELECT * FROM menu_optionals WHERE menu_id = ?", menu_id, (err, result) => {
        if (err) throw err;
        var data = JSON.parse(JSON.stringify(result));
        res.send(data)
    })
})

// get queue
app.get('/getQueue', (req, res) => {
    db.query(
        `SELECT queue_id, menu_name, meat, spicy, extra, egg, optional_text, container, quantity, queue_status FROM queues
        INNER JOIN menus ON menus.menu_id = queues.menu_id`, (err, result) => {
        if (err) throw err;
        var data = JSON.parse(JSON.stringify(result));
        res.send(data)
    })
})

// // add queue
// app.post('/addQueue', (req, res) => {
    
// })

// get order
app.get('/getOrder', (req, res) => {
    db.query(
        `SELECT orders.order_id, order_menu_id, order_status, order_menu_status, total_menu, order_menu_id, CONCAT(menu_name, " ", meat) AS menu, spicy ,extra, egg, optional_text, container, queue_id
        FROM orders
        INNER JOIN order_menus
        ON orders.order_id = order_menus.order_id
        INNER JOIN menus
        ON order_menus.menu_id = menus.menu_id`, (err, result) => {
            if (err) throw err;
            var data = JSON.parse(JSON.stringify(result));
            res.send(data)
         }
    )
})

// add order
app.post('/addOrder', (req, res) => {
    const {menu} = req.body
    db.query(
        `INSERT INTO orders (order_status, total_menu)
         VALUES ('pending', ?)`, menu.length, (err, result) => {
            if (err) throw err
            const order_id = result.insertId
            for (let i = 0; i < menu.length; i++) {
                db.query(
                    `INSERT INTO order_menus (order_id, menu_id, meat, spicy, extra, egg, optional_text, container, queue_id, order_menu_status)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`, [order_id, menu[i].menu_id, menu[i].meat, menu[i].spicy, menu[i].extra, menu[i].egg, menu[i].optional_text, menu[i].container, null], (err, result) => {
                    if (err) throw err
                })
            }
            res.send("order created")
        }
    )
})

// get order by id
app.get('/getOrderById', (req, res) => {
    const order_id = req.body.order_id
    db.query(
        `SELECT orders.order_id, order_status , menu_name, meat, spicy, extra, egg, container FROM orders
         INNER JOIN order_items
         ON orders.order_id = order_items.order_id
         INNER JOIN menus
         ON order_items.menu_id = menus.menu_id
         WHERE orders.order_id = ?`, order_id, (err, result) => {
        if (err) {
            res.status(500).send("Error finding in order")
        } else {
            var data = JSON.parse(JSON.stringify(result));
            res.send(data)
        }
    })
})

// change status in orders and queues to approve and cooking respectively
app.post('/changeStatus', (req, res) => {
    const {queue_id, queue_status, order_status} = req.body
    try {
        db.query(
            `UPDATE queues SET queue_status = ? WHERE queue_id = ?`, [queue_status, queue_id])
        db.query(
            `UPDATE orders SET order_status = ? WHERE queue_id = ?`, [order_status, queue_id])
    } catch (error) {
        console.log(error)
        res.status(500).send("Error changing status")
    } finally {
        res.status(200).send("Status changed")
    }
})

server.listen(3001, () => {
    console.log('Application is running on port 3001');
})