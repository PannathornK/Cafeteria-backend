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

app.get('/', (req, res) => {
    res.send("ok")
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
// app.get('/getMenu', (req, res) => {
//     db.query("SELECT * FROM menus", (err, result) => {
//         if (err) throw err;
//         var data = JSON.parse(JSON.stringify(result));
//         res.send(data)
//     })
//     // res.send("ok")
// })

// get all menu with optionals
app.get('/getMenuWithOptionals', (req, res) => {
    const data = {
        menus: []
    };

    const queryDatabase = (sql, params) => {
        return new Promise((resolve, reject) => {
            db.query(sql, params, (err, result) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(result);
                }
            });
        });
    };

    queryDatabase('SELECT menu_id, menu_name, menu_picture, price FROM menus')
    .then(menuResults => {
        data.menus = menuResults.map(menu => ({
            id: menu.menu_id,
            title: menu.menu_name,
            image: menu.menu_picture,
            price: Number(menu.price),
            options: []
        }));

        // Fetch options for each menu based on optional_type
        const optionsPromises = data.menus.map(menu => {
            return Promise.all([
                queryDatabase(`SELECT optional_value, additional_price FROM menu_optionals WHERE menu_id = ? AND optional_type = 'meat'`, menu.id),
                queryDatabase(`SELECT optional_value, additional_price FROM menu_optionals WHERE menu_id = ? AND optional_type = 'spicy'`, menu.id),
                queryDatabase(`SELECT optional_value, additional_price FROM menu_optionals WHERE menu_id = ? AND optional_type = 'egg'`, menu.id),
                queryDatabase(`SELECT optional_value, additional_price FROM menu_optionals WHERE menu_id = ? AND optional_type = 'container'`, menu.id)
            ]);
        });

        return Promise.all(optionsPromises);
    })
    .then(optionsResults => {
        optionsResults.forEach((options, index) => {
            const [meatOptions, spicyOptions, eggOptions, containerOptions] = options;
            
            data.menus[index].options.push({
                title: 'ประเภทเนื้อสัตว์',
                required: 1,
                options: meatOptions.map(option => ({
                    name: option.optional_value,
                    price: Number(option.additional_price)
                }))
            });

            data.menus[index].options.push({
                title: 'ระดับความเผ็ด',
                required: 1,
                options: spicyOptions.map(option => ({
                    name: option.optional_value,
                    price: Number(option.additional_price)
                }))
            });

            data.menus[index].options.push({
                title: 'เพิ่มไข่',
                required: 0,
                options: eggOptions.map(option => ({
                    name: option.optional_value,
                    price: Number(option.additional_price)
                }))
            });

            data.menus[index].options.push({
                title: 'ภาชนะ',
                required: 1,
                options: containerOptions.map(option => ({
                    name: option.optional_value,
                    price: Number(option.additional_price)
                }))
            });
        });

        res.send(data);
    })
    .catch(err => {
        // Handle errors here
        console.error(err);
        res.status(500).send('Internal Server Error');
    });
});



// get queue
app.get('/getQueue', (req, res) => {
    db.query(
        `SELECT queue_id, CONCAT(menu_name, " ", meat) AS menu, spicy, extra, egg, optional_text, container, quantity, queue_status FROM queues
        INNER JOIN menus ON menus.menu_id = queues.menu_id`, (err, result) => {
        if (err) throw err;
        var data = JSON.parse(JSON.stringify(result));
        res.send(data)
    })
})

// // add queue
app.post('/addQueue', (req, res) => {
    const approvedOrdersId = req.body.approvedOrders;
    const approvedOrders = [];
    db.query(
        `SELECT menu_id, meat, spicy, extra, egg, optional_text, container
         FROM order_menus
         WHERE order_menu_id IN (${approvedOrdersId.map(() => '?').join(',')})
        `, approvedOrdersId, (err, result) => {
            if (err) {
                res.status(500).send("Error retrieving queue");
            } else {
                const data = JSON.parse(JSON.stringify(result));
                approvedOrders.push(...data);

                const processOrder = (index) => {
                    if (index < approvedOrders.length){
                        const approvedOrder = approvedOrders[index];
                        db.query(
                            `SELECT queue_id
                             FROM queues WHERE menu_id = ?
                             AND meat = ?
                             AND spicy <=> ?
                             AND extra = ?
                             AND egg <=> ?
                             AND optional_text <=> ?
                             AND container <=> ?
                             AND queue_status = 'approved'`,
                             Object.values(approvedOrder),
                             (err, result) => {
                                if (err) {
                                    res.status(500).send("Error checking existing queue")
                                } else {
                                    const existingQueue = result[0] && result[0].queue_id;

                                    const insertOrUpdateQueue = () => {
                                        const query = existingQueue
                                            ? `UPDATE queues SET quantity = quantity + 1 WHERE queue_id = ?`
                                            : `INSERT INTO queues (menu_id, meat, spicy, extra, egg, optional_text, container, quantity, create_date, queue_status)
                                               VALUES (?, ?, ?, ?, ?, ?, ?, 1, NOW(), 'approved')`;

                                        db.query(
                                            query, existingQueue ? [existingQueue] : Object.values(approvedOrder),
                                            (err, result) => {
                                                if (err) {
                                                    res.status(500).send("Error adding/updating queue");
                                                } else {
                                                    const updatedQueueId = existingQueue || result.insertId;
                                                    db.query(`UPDATE order_menus SET queue_id = ? WHERE order_menu_id = ?`,
                                                        [updatedQueueId, approvedOrdersId[index]],
                                                        (err, result) => {
                                                            if (err) {
                                                                res.status(500).send("Error updating queue_id in order_menus");
                                                            } else {
                                                                processOrder(index + 1);
                                                            }
                                                        }
                                                    )
                                                }
                                            }
                                        )
                                    }
                                    insertOrUpdateQueue();
                                }
                             }
                        )
                    } else {
                        res.send('All queues processed');
                    }
                }
                processOrder(0);
            }
        }
    )
})

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
            console.error(err);
            res.status(500).send("Error finding in order")
        } else {
            var data = JSON.parse(JSON.stringify(result));
            res.send(data)
        }
    })
})

// change status in orders
app.post('/changeStatus', async (req, res) => {
    const approvedOrders = req.body.approvedOrders || [];
    const rejectedOrders = req.body.rejectedOrders || [];

    const updateApprovedQuery = `
        UPDATE order_menus
        SET order_menu_status = 'approved'
        WHERE order_menu_id IN (${approvedOrders.map(() => '?').join(',')})
    `;
    const updateRejectedQuery = `
        UPDATE order_menus
        SET order_menu_status = 'rejected' 
        WHERE order_menu_id IN (${rejectedOrders.map(() => '?').join(',')})
    `;

    const updateOrders = async(query, items) => {
        return new Promise((resolve, reject) => {
            if (items.length > 0) {
                db.query(query, [...items], (error) => {
                    if (error) {
                        reject(error);
                    } else {
                        resolve();
                    }
                })
            } else {
                resolve();
            }
        });
    };
    try {
        await Promise.all([
            updateOrders(updateApprovedQuery, approvedOrders),
            updateOrders(updateRejectedQuery, rejectedOrders),
        ]);
        res.status(200).send({message: 'Status updated'});
    } catch (error) {
        res.status(500).json({ error: 'Failed to update status' });
    }
})

// change status in queues and order_menus
app.post('/changeQueueStatus', async (req, res) => {
    const { queue_id, status } = req.body;

    const updateQueueQuery = `
        UPDATE queues
        SET queue_status = ?
        WHERE queue_id = ?
    `;
    const updateOrderQuery = `
        UPDATE order_menus
        SET order_menu_status = ?
        WHERE queue_id = ?
    `;

    const updateOrders = async (query, params) => {
        return new Promise((resolve, reject) => {
            db.query(query, params, (error) => {
                if (error) {
                    reject(error);
                } else {
                    resolve();
                }
            });
        });
    };

    try {
        await updateOrders(updateQueueQuery, [status, queue_id]);
        await updateOrders(updateOrderQuery, [status, queue_id]);

        if (status === 'finished') {
            await updateOrders(
                `UPDATE order_menus
                 SET queue_id = null
                 WHERE queue_id = ?`, [queue_id]
            );
        }

        res.status(200).send({ message: 'Status changed' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to change queue status' });
    }
});

// update today sales by incoming sale value
app.post('/updateTodaySales', (req, res) => {
    const { sales } = req.body;

    const query = `
        UPDATE today_sales_data
        SET today_sales = today_sales + ?
        WHERE date = CURRENT_DATE();
    `

    db.query(query, [sales], (err, result) => {
        if (err) {
            console.error('Error updating today sales:', err);
            res.status(500).json({ success: false, message: 'Failed to update today sales' });
        } else {
            res.status(200).json({ success: true, message: 'Today sales updated successfully' });
        }
    })
})

// update monthly sales by incoming sale value
app.post('/updateMonthlySales', (req, res) => {
    const { sales } = req.body;

    const query = `
        UPDATE monthly_sales_data
        SET sales = sales + ?
        WHERE monthly_sale_id IN (
            SELECT monthly_sale_id
            FROM (
                SELECT monthly_sale_id
                FROM monthly_sales_data
                WHERE month = MONTH(CURRENT_DATE()) AND year = YEAR(CURRENT_DATE())
            ) AS subquery
        );
    `;

    db.query(query, [sales], (err, result) => {
        if (err) {
            console.error('Error updating monthly sales:', err);
            res.status(500).json({ success: false, message: 'Failed to update monthly sales' });
        } else {
            res.status(200).json({ success: true, message: 'Monthly sales updated successfully' });
        }
    })
});

// get today sales value
app.get('/getTodaySales', (req, res) => {
    const query = `
        SELECT today_sales
        FROM today_sales_data
        WHERE date = CURRENT_DATE()
        LIMIT 1;
    `;

    db.query(query, (err, result) => {
        if (err) {
            console.error('Error fetching today sales:', err);
            res.status(500).send("Error fetching today sales");
        } else {
            if (result.length > 0) {
                const todaySales = result[0].today_sales;
                res.status(200).send(todaySales.toString());
            } else {
                res.status(200).send('0');
            }
        }
    })
})

// get monthly sales value
app.get('/getMonthlySales', (req, res) => {
    const query = `
        SELECT month, sales
        FROM (
            SELECT month, year, sales
            FROM monthly_sales_data
            WHERE (year * 12 + month) <= (YEAR(CURRENT_DATE()) * 12 + MONTH(CURRENT_DATE()))
            ORDER BY year DESC, month DESC
            LIMIT 7
        ) AS sub
        ORDER BY year ASC, month ASC;    
    `;

    db.query(query, (err, result) => {
        if (err) {
            console.error('Error fetching monthly sales:', err);
            res.status(500).send("Error fetching monthly sales");
        } else {
            var data = JSON.parse(JSON.stringify(result));
            res.status(200).send(data)
        }
    })
})

server.listen(3001, () => {
    console.log('Application is running on port 3001');
})