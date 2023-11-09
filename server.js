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
    host: "pchang-db.cjvysxsaotkk.us-east-1.rds.amazonaws.com",
    port: "3306",
    user: "admin",
    password: "project2023",
    database: "changdb",
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

// add order and update queue
app.post('/addOrder', (req, res) => {
    const {menu_id, meat, spicy, extra, egg, container, optional_text} = req.body
    var existing_queue;
    db.query(
        `SELECT queue_id
         FROM queues WHERE menu_id = ?
         AND meat = ?
         AND spicy <=> ?
         AND extra = ?
         AND egg <=> ?
         AND optional_text <=> ?
         AND container <=> ?
         AND queue_status = 'wait-confirm'`, [menu_id, meat, spicy, extra, egg, optional_text, container], (err, result) => {
        if (err) {
            res.status(500).send("Error find queue");
        } else {
            existing_queue = result[0] && result[0].queue_id;
            if (existing_queue) {
                db.query(`UPDATE queues SET quantity = quantity + 1 WHERE queue_id = ?`, existing_queue)
                db.query(
                    `INSERT INTO orders (menu_id, meat, spicy, extra, egg, optional_text, container, order_status, queue_id)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [menu_id, meat, spicy, extra, egg, optional_text, container, 'pending', existing_queue], (err, result) => {
                    if (err) {
                        res.status(500).send("Error creating order");
                    } else {
                        res.status(200).send("Order created");
                    }
                })
            } else {
                db.query(
                    `INSERT INTO queues (menu_id, meat, spicy, extra, egg, optional_text, container, quantity, create_date, queue_status)
                    VALUES (?, ?, ?, ?, ?, ?, ?, 1, NOW(), 'wait-confirm');`, [menu_id, meat, spicy, extra, egg, optional_text, container], (err, result) => {
                if (err) {
                    res.status(500).send("Error creating queue");
                } else {
                    const queue_id = result.insertId
                    db.query(
                        `INSERT INTO orders (menu_id, meat, spicy, extra, egg, optional_text, container, order_status, queue_id)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [menu_id, meat, spicy, extra, egg, optional_text, container, 'pending', queue_id], (err, result) => {
                        if (err) {
                            res.status(500).send("Error creating order");
                        } else {
                            res.status(200).send("Order created");
                        }})
                    }
                })
            }
        }
    })
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