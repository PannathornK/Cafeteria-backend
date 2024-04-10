require('dotenv').config();

const express = require('express');
const { PutObjectCommand, S3Client } = require('@aws-sdk/client-s3');
const multer = require('multer');
const cors = require('cors');
const http = require('http');
const mysql = require("mysql");
const bodyParser = require('body-parser')
const WebSocket = require('ws');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(cors())
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

const upload = multer();

const client = new S3Client({ 
    region: process.env.AWS_REGION,
    accesskeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
});

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

// default route
app.get('/', (req, res) => {
    res.send("ok")
})

// add menu into menus table
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

// get all menu from menus table
app.get('/getMenu', (req, res) => {
    db.query("SELECT * FROM menus", (err, result) => {
        if (err) throw err;
        var data = JSON.parse(JSON.stringify(result));
        res.send(data)
    })
    // res.send("ok")
})

// get optional by menu id from menu_optionals table
app.get('/getOptionalByMenuId/:menuId', (req, res) => {
    const menu_id = parseInt(req.params.menuId);
    const data = {
        id: menu_id,
        title: '',
        price: 0,
        image: '',
        options: [
            {
                title: 'ประเภทเนื้อสัตว์',
                required: 1,
                options: []
            },
            {
                title: 'ระดับความเผ็ด',
                required: 1,
                options: []
            },
            {
                title: 'เพิ่มไข่',
                required: 0,
                options: []
            },
            {
                title: 'ภาชนะ',
                required: 1,
                options: []
            }
        ]
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

    Promise.all([
        queryDatabase('SELECT menu_name, menu_picture, price FROM menus WHERE menu_id = ?', menu_id),
        queryDatabase(`SELECT optional_value, additional_price, availability FROM menu_optionals WHERE menu_id = ? AND optional_type ='meat'`, menu_id),
        queryDatabase(`SELECT optional_value, additional_price, availability FROM menu_optionals WHERE menu_id = ? AND optional_type ='spicy'`, menu_id),
        queryDatabase(`SELECT optional_value, additional_price, availability FROM menu_optionals WHERE menu_id = ? AND optional_type ='egg'`, menu_id),
        queryDatabase(`SELECT optional_value, additional_price, availability FROM menu_optionals WHERE menu_id = ? AND optional_type ='container'`, menu_id)
    ])
    .then(([menuResult, meatResult, spicyResult, eggResult, containerResult]) => {
        data.title = menuResult[0].menu_name;
        data.image = menuResult[0].menu_picture;
        data.price = Number(menuResult[0].price);

        data.options.find(opt => opt.title === 'ประเภทเนื้อสัตว์').options = meatResult.map(opt => ({
            name: opt.optional_value,
            price: Number(opt.additional_price),
            availability: opt.availability
        }));
        data.options.find(opt => opt.title === 'ระดับความเผ็ด').options = spicyResult.map(opt => ({
            name: opt.optional_value,
            price: Number(opt.additional_price),
            availability: opt.availability
        }));
        data.options.find(opt => opt.title === 'เพิ่มไข่').options = eggResult.map(opt => ({
            name: opt.optional_value,
            price: Number(opt.additional_price),
            availability: opt.availability
        }));
        data.options.find(opt => opt.title === 'ภาชนะ').options = containerResult.map(opt => ({
            name: opt.optional_value,
            price: Number(opt.additional_price),
            availability: opt.availability
        }));

        res.send(data);
    })
    .catch(err => {
        // Handle errors here
        console.error(err);
        res.status(500).send('Internal Server Error');
    });
});

// get availability for all menus in menus table
app.get('/getMenuAvailability', (req, res) => {
    db.query(`
        SELECT menu_id, menu_name, availability
        FROM menus
    `, (err, result) => {
        if (err) throw err;
        var data = JSON.parse(JSON.stringify(result));
        res.send(data)
    })
})

// update availability with menu id in menus table
app.put('/updateMenuAvailability', (req, res) => {
    const { menu_id, availability } = req.body;
    db.query(`
        UPDATE menus
        SET availability = ?
        WHERE menu_id = ?
    `, [availability, menu_id], (err, result) => {
        if (err) {
            res.status(500).send("Error updating menu availability");
        } else {
            res.send('menu availability updated')
        }
    })
})

// get availability for all options in option_availability table
app.get('/getOptionAvailability', (req, res) => {
    db.query(`
        SELECT option_id, option_value, availability
        FROM option_availability
    `, (err, result) => {
        if (err) throw err;
        var data = JSON.parse(JSON.stringify(result));
        res.send(data)
    })
})

// update availability with option id in option_availability table
app.put('/updateOptionAvailability', (req, res) => {
    const { option_id, availability } = req.body;
    db.query(`
        UPDATE option_availability
        SET availability = ?
        WHERE option_id = ?
    `, [availability, option_id], (err, result) => {
        if (err) {
            res.status(500).send("Error updating option availability");
        } else {
            res.send('option availability updated')
        }
    })
})

// get all queue from queues table
app.get('/getQueue', (req, res) => {
    db.query(
        `SELECT queue_id, queues.menu_id, CONCAT(menu_name, " ", meat) AS menu, spicy, extra, egg, optional_text, container, quantity, queue_status FROM queues
        INNER JOIN menus ON menus.menu_id = queues.menu_id`, (err, result) => {
        if (err) throw err;
        var data = JSON.parse(JSON.stringify(result));
        res.send(data)
    })
})

// add new queue into queues table
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

// get all order from orders table
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

// add new order into orders and order_menus table
app.post('/addOrder', async (req, res) => {
    try {
        const {menu} = req.body
        const totalPrice = menu.reduce((total, item) => total + item.price, 0);

        const orderInsertResult = await new Promise((resolve, reject) => {
            db.query(
                `INSERT INTO orders (order_status, total_price, total_menu, approved_menu, rejected_menu, cooking_menu, finished_menu, paid)
                 VALUES ('pending', ?, ?, 0, 0, 0, 0, false)`, [totalPrice, menu.length], (err, result) => {
                    if (err) reject(err)
                    resolve(result.insertId)
                }
            )
        })

        const order_id = orderInsertResult;
        for (let i = 0; i < menu.length; i++) {
            await new Promise((resolve, reject) => {
                db.query(
                    `INSERT INTO order_menus (order_id, menu_id, meat, spicy, extra, egg, optional_text, container, queue_id, order_menu_status, price)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
                    [order_id, menu[i].menu_id, menu[i].meat, menu[i].spicy, menu[i].extra, menu[i].egg, menu[i].optional_text, menu[i].container, null, menu[i].price],
                    (err, result) => {
                        if (err) reject(err);
                        resolve(result);
                    }
                )
            })
        }
        res.send({ order_id: order_id});
    } catch (error) {
        console.error('Error adding order:', error);
        res.status(500).json({ success: false, message: 'Internal Server Error'});
    }
})

// get order by id from orders and order_menus table
app.get('/getOrderById/:order_id', (req, res) => {
    const order_id = parseInt(req.params.order_id)
    const data = {
        orderId: order_id,
        orderStatus: '',
        totalPrice: 0,
        orderMenu: [
            {
                order_menu_id: '',
                menu_id: '',
                menu_name: '',
                meat: '',
                spicy: '',
                extra: '',
                egg: '',
                optional_text: '',
                container: '',
                orderMenuStatus: '',
                price: 0
            }
        ]
    }
    const queryDatabase = (sql, params) => {
        return new Promise((resolve, reject) => {
            db.query(sql, params, (err, result) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(result);
                }
            })
        })
    }

    Promise.all([
        queryDatabase(`SELECT order_status, total_price FROM orders WHERE order_id = ?`, [order_id]),
        queryDatabase(`
            SELECT order_menu_id, order_menus.menu_id, menu_name, meat, spicy, extra, egg, optional_text, container, order_menu_status, order_menus.price
            FROM order_menus
            INNER JOIN menus
            ON order_menus.menu_id = menus.menu_id
            WHERE order_menus.order_id = ?`, [order_id])
    ])
    .then(([orderResult, menuResult]) => {
        if (orderResult.length > 0) {
            data.orderStatus = orderResult[0].order_status;
            data.totalPrice = orderResult[0].total_price;
        }

        data.orderMenu = menuResult.map(item => ({
            order_menu_id: item.order_menu_id,
            menu_id: item.menu_id,
            menu_name: item.menu_name,
            meat: item.meat,
            spicy: item.spicy,
            extra: item.extra,
            egg: item.egg,
            optionalText: item.optional_text,
            container: item.container,
            orderMenuStatus: item.order_menu_status,
            price: item.price
        }))

        res.status(200).json(data);
    })
    .catch(err => {
        console.error(err);
        res.status(500).send('Internal Server Error');
    })
})

// change status in order_menus table
app.post('/changeStatus', async (req, res) => {
    const orderId = req.body.orderId;
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
    const updateOrderCount = `
        UPDATE orders
        SET approved_menu = ?, rejected_menu = ?
        WHERE order_id = ?
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
            updateOrders(updateOrderCount, [approvedOrders.length, rejectedOrders.length, orderId]),
            updateOrders(updateApprovedQuery, approvedOrders),
            updateOrders(updateRejectedQuery, rejectedOrders),
        ]);
        res.status(200).send({message: 'Status updated'});
    } catch (error) {
        res.status(500).json({ error: 'Failed to update status' });
    }
})

// change status in queues and order_menus table
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

// update today sales by incoming sale value in today_sales_data table
app.put('/updateTodaySales', (req, res) => {
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

// update monthly sales by incoming sale value in monthly_sales_data table
app.put('/updateMonthlySales', (req, res) => {
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

// update best selling menu item by incoming data in best_selling_menu_daily table
app.put('/updateBestSellingMenu', (req, res) => {
    const { menu_id } = req.body
    const sale_date = new Date().toISOString().slice(0, 10);

    db.query(`
        SELECT * FROM best_selling_menu_daily
        WHERE menu_id = ? AND sale_date = ?;`, [menu_id, sale_date], (err, result) => {
        if (err) {
            console.error('Error checking best selling menu:', err);
            return res.status(500).json({ success: false, message: 'Internal Server Error'});
        }

        if (result.length > 0) {
            db.query(`
                UPDATE best_selling_menu_daily
                SET daily_amount = daily_amount + 1
                WHERE menu_id = ? AND sale_date = ?;`, [menu_id, sale_date], (err, result) => {
                if (err) {
                    console.error('Error updating best selling menu:', err);
                    return res.status(500).json({ success: false, message: 'Internal Server Error' });
                }
                res.status(200).json({ success: true, message: 'Best selling menu updated successfully' });
            })
        } else {
            db.query(`
                INSERT INTO best_selling_menu_daily (menu_id, daily_amount, sale_date)
                VALUES (?, 1, ?);`, [menu_id, sale_date], (err, result) => {
                if (err) {
                    console.error('Error updating best selling menu:', err);
                    return res.status(500).json({ success: false, message: 'Internal Server Error' });
                }
                res.status(200).json({ success: true, message: 'Best selling menu updated successfully' });
            })
        }
    })
})

// update ingredients used by incoming data in ingredients_used_daily table
app.put('/updateIngredientsUsed', (req, res) => {
    const { optional_value } = req.body
    const date_used = new Date().toISOString().slice(0, 10);

    db.query(`
        SELECT * FROM ingredients_used_daily
        WHERE ingredient_name = ? AND date_used = ?;
    `, [optional_value, date_used], (err, result) => {
        if (err) {
            console.error('Error checking ingredients used:', err);
            return res.status(500).json({ success: false, message: 'Internal Server Error' });
        }

        if (result.length > 0) {
            db.query(`
                UPDATE ingredients_used_daily
                SET daily_used = daily_used + 1
                WHERE ingredient_name = ? AND date_used = ?;
            `, [optional_value, date_used], (err, result) => {
                if (err) {
                    console.error('Error updating ingredients used:', err);
                    return res.status(500).json({ success: false, message: 'Internal Server Error' });
                }
                res.status(200).json({ success: true, message: 'Ingredients used updated successfully' });
            })
        } else {
            db.query(`
                INSERT INTO ingredients_used_daily (ingredient_name, daily_used, date_used)
                VALUES (?, 1, ?);
            `, [optional_value, date_used], (err, result) => {
                if (err) {
                    console.error('Error updating ingredients used:', err);
                    return res.status(500).json({ success: false, message: 'Internal Server Error' });
                }
                res.status(200).json({ success: true, message: 'Ingredients used updated successfully' });
            })
        }
    })
})

// update store state
app.put('/updateStoreState', (req, res) => {
    const { state } = req.body
    db.query(`
        UPDATE store_state
        SET is_open = ?
        WHERE id = 1;
    `, [state], (err, result) => {
        if (err) {
            console.error('Error updating store state:', err);
            return res.status(500).json({ success: false, message: 'Internal Server Error' });
        }
        res.status(200).json({ success: true, message: 'Store state updated successfully' });
    })
})

// get today sales value from today_sales_data table
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

// get monthly sales value from monthly_sales_data table
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

// get best selling menu value from best_selling_menu_daily table
app.get('/getBestSellingMenu', (req, res) => {
    const sale_date = new Date().toISOString().slice(0, 10);
    db.query(`
        SELECT b.menu_id, m.menu_name, b.daily_amount
        FROM best_selling_menu_daily b
        INNER JOIN menus m
        ON b.menu_id = m.menu_id
        WHERE b.sale_date = ?
        ORDER BY b.daily_amount DESC
        LIMIT 6;
    `, [sale_date], (err, result) => {
        if(err) {
            console.error('Error fetching best selling menu:', err);
            res.status(500).send("Error fetching best selling menu");
        } else {
            var data = JSON.parse(JSON.stringify(result));
            res.status(200).send(data)
        }
    })
})

// get ingredients used from ingredients_used_daily table
app.get('/getIngredientsUsed', (req, res) => {
    const date_used = new Date().toISOString().slice(0, 10);
    db.query(`
        SELECT ingredient_daily_id, ingredient_name, daily_used
        FROM ingredients_used_daily
        WHERE date_used = ?
        ORDER BY daily_used DESC
        LIMIT 6;
    `, [date_used], (err, result) => {
        if(err) {
            console.error('Error fetching ingredients used:', err);
            res.status(500).send("Error fetching ingredients used");
        } else {
            var data = JSON.parse(JSON.stringify(result));
            res.status(200).send(data)
        }
    })
})

// get store state
app.get('/getStoreState', (req, res) => {
    db.query(`
        SELECT is_open FROM store_state WHERE id = 1
    `, (err, result) => {
        if(err) {
            console.error('Error fetching store state:', err);
            res.status(500).send("Error fetching store state");
        } else {
            var data = JSON.parse(JSON.stringify(result));
            res.status(200).send(data)
        }
    })
})

// get all payments from payments table
app.get('/getPayments', (req, res) => {
    db.query(`
        SELECT * FROM payments
    `, (err, result) => {
        if(err) {
            console.error('Error fetching payments:', err);
            res.status(500).send("Error fetching payments");
        } else {
            var data = JSON.parse(JSON.stringify(result));
            res.status(200).send(data)
        }
    })
})

// add payment to payments table
app.post('/addPayment', (req, res) => {
    const { order_id, payment_picture, total_price} = req.body;

    db.query(`
        UPDATE orders SET paid = 1 WHERE order_id = ?
    `, [order_id], (err, result) => {
        if (err) {
            console.error('Error updating paid status:', err);
            return res.status(500).json({ success: false, message: 'Internal Server Error' });
        }
        db.query(`
            INSERT INTO payments (order_id, payment_picture, date_time, total_price)
            VALUES (?, ?, NOW(), ?)
        `, [order_id, payment_picture, total_price], (err, result) => {
            if (err) {
                console.error('Error adding payment:', err);
                return res.status(500).json({ success: false, message: 'Internal Server Error' });
            }
            return res.status(200).json({ success: true, message: 'Payment added successfully and paid status updated' });
        })
    })
})

// upload picture to AWS S3
app.post('/upload', upload.single("image"), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).send("No image file uploaded.");
        }

        const image = req.file.buffer;
        const key = Date.now().toString() + '-' + req.file.originalname
        const contentType = req.file.mimetype;

        const command = new PutObjectCommand({
            Bucket: process.env.AWS_BUCKET_NAME,
            Key: key,
            Body: image,
            ContentType: contentType,
        });

        const response = await client.send(command);
        console.log("Upload successful:", response);
        const url = `https://${process.env.AWS_BUCKET_NAME}.s3.amazonaws.com/${key}`;
        res.status(200).json({ success: true, message: 'File uploaded successfully', imageUrl: url });

    } catch (err) {
        console.error('Error uploading image:', err);
        return res.status(500).json({ success: false, message: 'File upload failed', error: err.message });
    }
})

server.listen(3001, () => {
    console.log('Application is running on port 3001');
})