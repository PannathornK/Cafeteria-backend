const express = require('express');
const mysql = require("mysql");
const bodyParser = require('body-parser')

const app = express();

app.use(bodyParser.json());

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
            console.log(result);
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

// add queue
app.post('/addQueue', (req, res) => {
    const {order_id, queue_num, create_date, queue_status} = req.body
    const queue = [[order_id, queue_num, create_date, queue_status]]
    db.query(
        `INSERT INTO queues (order_id, queue_num, create_date, queue_status)
         VALUES ?`, [queue], (err, result) => {
        if (err) {
            res.status(500).send("Error creating queue");
        } else {
            console.log(result)
            res.send('queue added')
        }
    })
})

// get queue
app.get('/getQueue', (req, res) => {
    db.query("SELECT * FROM queues", (err, result) => {
        if (err) throw err;
        var data = JSON.parse(JSON.stringify(result));
        res.send(data)
    })
})

// add order
app.post('/addOrder', (req, res) => {
    var order_id;
    db.query("INSERT INTO orders (order_status) VALUES ('pending')", (err, result) => {
        if (err) {
            res.status(500).send("Error creating order");
        } else {
            order_id = result.insertId;
            const {menu_id, quantity, meat, spicy, extra, egg, container, optional_text} = req.body
            const orderItem = [[order_id, menu_id, quantity, meat, spicy, extra, egg, container, optional_text]]
    
            db.query(
                `INSERT INTO order_items (order_id, menu_id, quantity, meat,
                 spicy, extra, egg, container, optional_text) VALUES ?`, [orderItem], (err, result) => {
                if (err) {
                    res.status(500).send("Error creating order item");
                } else {
                    console.log(result)
                    res.status(200).json({ order_id: order_id });
                }
            })
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

app.listen(3001, () => {
    console.log('Application is running on port 3001');
})