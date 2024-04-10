CREATE TABLE `menus` (
  `menu_id` int NOT NULL AUTO_INCREMENT,
  `menu_name` varchar(60) DEFAULT NULL,
  `menu_picture` varchar(100) DEFAULT NULL,
  `price` int DEFAULT NULL,
  `availability` tinyint DEFAULT NULL,
  PRIMARY KEY (`menu_id`)
);

CREATE TABLE `menu_optionals` (
  `menu_optional_id` int NOT NULL AUTO_INCREMENT,
  `menu_id` int DEFAULT NULL,
  `optional_value` varchar(50) DEFAULT NULL,
  `optional_type` enum('meat','spicy','egg','container') DEFAULT NULL,
  `additional_price` int DEFAULT NULL,
  `availability` tinyint DEFAULT NULL,
  PRIMARY KEY (`menu_optional_id`),
  KEY `fk_menu_optionals_menu_id` (`menu_id`),
  CONSTRAINT `fk_menu_optionals_menu_id` FOREIGN KEY (`menu_id`) REFERENCES `menus` (`menu_id`)
);

CREATE TABLE `orders` (
  `order_id` int NOT NULL AUTO_INCREMENT,
  `order_status` enum('approved','rejected','pending','finished','wait-pay','cooking') DEFAULT NULL,
  `total_price` int DEFAULT NULL,
  `total_menu` int DEFAULT NULL,
  `approved_menu` int DEFAULT NULL,
  `rejected_menu` int DEFAULT NULL,
  `cooking_menu` int DEFAULT NULL,
  `finished_menu` int DEFAULT NULL,
  `paid` tinyint DEFAULT NULL,
  PRIMARY KEY (`order_id`)
);

CREATE TABLE `order_menus` (
  `order_menu_id` int NOT NULL AUTO_INCREMENT,
  `order_id` int DEFAULT NULL,
  `menu_id` int DEFAULT NULL,
  `meat` varchar(20) DEFAULT NULL,
  `spicy` varchar(20) DEFAULT NULL,
  `extra` tinyint(1) DEFAULT NULL,
  `egg` varchar(20) DEFAULT NULL,
  `optional_text` varchar(255) DEFAULT NULL,
  `container` varchar(20) DEFAULT NULL,
  `queue_id` int DEFAULT NULL,
  `order_menu_status` enum('approved','rejected','cooking','finished','pending') DEFAULT NULL,
  `price` int DEFAULT NULL,
  PRIMARY KEY (`order_menu_id`),
  KEY `fk_order_menus_order_id` (`order_id`),
  KEY `fk_order_menus_menu_id` (`menu_id`),
  KEY `fk_order_menus_queue_id` (`queue_id`),
  CONSTRAINT `fk_order_menus_menu_id` FOREIGN KEY (`menu_id`) REFERENCES `menus` (`menu_id`),
  CONSTRAINT `fk_order_menus_order_id` FOREIGN KEY (`order_id`) REFERENCES `orders` (`order_id`),
  CONSTRAINT `fk_order_menus_queue_id` FOREIGN KEY (`queue_id`) REFERENCES `queues` (`queue_id`)
);

CREATE TABLE `queues` (
  `queue_id` int NOT NULL AUTO_INCREMENT,
  `menu_id` int DEFAULT NULL,
  `meat` varchar(45) DEFAULT NULL,
  `spicy` varchar(45) DEFAULT NULL,
  `extra` tinyint DEFAULT NULL,
  `egg` varchar(45) DEFAULT NULL,
  `optional_text` varchar(255) DEFAULT NULL,
  `container` varchar(45) DEFAULT NULL,
  `quantity` int DEFAULT NULL,
  `create_date` datetime DEFAULT NULL,
  `queue_status` enum('approved','cooking','finished') DEFAULT NULL,
  PRIMARY KEY (`queue_id`),
  KEY `fk_queues_menu_id` (`menu_id`),
  CONSTRAINT `fk_queues_menu_id` FOREIGN KEY (`menu_id`) REFERENCES `menus` (`menu_id`)
);

CREATE TABLE `payments` (
  `payment_id` int NOT NULL AUTO_INCREMENT,
  `order_id` int DEFAULT NULL,
  `payment_picture` varchar(100) DEFAULT NULL,
  `date_time` datetime DEFAULT NULL,
  `total_price` int DEFAULT NULL,
  PRIMARY KEY (`payment_id`),
  KEY `fk_payments_order_id` (`order_id`),
  CONSTRAINT `fk_payments_order_id` FOREIGN KEY (`order_id`) REFERENCES `orders` (`order_id`)
);

CREATE TABLE `best_selling_menu_daily` (
  `best_selling_daily_id` int NOT NULL AUTO_INCREMENT,
  `menu_id` int DEFAULT NULL,
  `daily_amount` int DEFAULT NULL,
  `sale_date` date DEFAULT NULL,
  PRIMARY KEY (`best_selling_daily_id`),
  KEY `menu_id` (`menu_id`),
  CONSTRAINT `best_selling_menu_daily_ibfk_1` FOREIGN KEY (`menu_id`) REFERENCES `menus` (`menu_id`)
);

CREATE TABLE `option_availability` (
  `option_id` int NOT NULL AUTO_INCREMENT,
  `option_value` varchar(50) DEFAULT NULL,
  `availability` tinyint DEFAULT NULL,
  PRIMARY KEY (`option_id`)
);

CREATE TABLE `ingredients_used_daily` (
  `ingredient_daily_id` int NOT NULL AUTO_INCREMENT,
  `ingredient_name` varchar(100) DEFAULT NULL,
  `daily_used` int DEFAULT NULL,
  `date_used` date DEFAULT NULL,
  PRIMARY KEY (`ingredient_daily_id`)
);

CREATE TABLE `today_sales_data` (
  `sale_id` int NOT NULL AUTO_INCREMENT,
  `date` date DEFAULT NULL,
  `today_sales` int DEFAULT NULL,
  PRIMARY KEY (`sale_id`)
);

CREATE TABLE `monthly_sales_data` (
  `monthly_sale_id` int NOT NULL AUTO_INCREMENT,
  `month` int DEFAULT NULL,
  `year` int DEFAULT NULL,
  `sales` int DEFAULT NULL,
  PRIMARY KEY (`monthly_sale_id`)
);

CREATE TABLE `store_state` (
  `id` int NOT NULL AUTO_INCREMENT,
  `is_open` tinyint NOT NULL,
  `last_updated` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
);

DELIMITER //
CREATE EVENT IF NOT EXISTS daily_reset_event
ON SCHEDULE EVERY 1 DAY
STARTS CURRENT_DATE() + INTERVAL 1 DAY
DO
BEGIN
    -- Insert new today_sales_data with date as current date and today_sales as 0
    INSERT INTO today_sales_data (date, today_sales)
    VALUES (CURRENT_DATE(), 0);
END; //
DELIMITER ;

DELIMITER //
CREATE EVENT IF NOT EXISTS monthly_reset_event
ON SCHEDULE
    EVERY 1 MONTH
    STARTS CURRENT_DATE() + INTERVAL 1 DAY
DO
BEGIN
    -- Insert new monthly_sales_data with month and year as current month and year and sales as 0
    INSERT INTO monthly_sales_data (month, year, sales)
    VALUES (MONTH(CURRENT_DATE()), YEAR(CURRENT_DATE()), 0);
END;
//
DELIMITER ;

DELIMITER //
CREATE TRIGGER update_menu_optionals AFTER UPDATE ON option_availability
FOR EACH ROW
BEGIN
    DECLARE done BOOLEAN DEFAULT FALSE;
    DECLARE menu_id_val INT;
    DECLARE optional_value_val VARCHAR(50);
    
    -- Declare cursor to fetch menu_optionals rows that match the updated option_availability
    DECLARE cur CURSOR FOR
        SELECT menu_id, optional_value
        FROM menu_optionals
        WHERE optional_value = NEW.option_value;
    
    -- Declare continue handler to exit loop when no more rows are found
    DECLARE CONTINUE HANDLER FOR NOT FOUND SET done = TRUE;
    
    -- Open cursor
    OPEN cur;
    
    -- Loop through cursor results
    read_loop: LOOP
        -- Fetch cursor row
        FETCH cur INTO menu_id_val, optional_value_val;
        
        -- Check if cursor is done
        IF done THEN
            LEAVE read_loop;
        END IF;
        
        -- Update menu_optionals row
        UPDATE menu_optionals
        SET availability = NEW.availability
        WHERE menu_id = menu_id_val AND optional_value = optional_value_val;
    END LOOP;
    
    -- Close cursor
    CLOSE cur;
END//
DELIMITER ;

DELIMITER //
CREATE TRIGGER update_order_counts_after_update
AFTER UPDATE ON order_menus
FOR EACH ROW
BEGIN
    DECLARE cooking_count INT;
    DECLARE finished_count INT;

    -- Get counts for different menu statuses
    SELECT 
        COUNT(CASE WHEN order_menu_status = 'cooking' THEN 1 END),
        COUNT(CASE WHEN order_menu_status = 'finished' THEN 1 END)
    INTO 
        cooking_count, finished_count
    FROM 
        order_menus
    WHERE 
        order_id = NEW.order_id;

    -- Update counts in orders table
    UPDATE 
        orders
    SET 
        cooking_menu = cooking_count,
        finished_menu = finished_count
    WHERE 
        order_id = NEW.order_id;
END; //
DELIMITER ;

DELIMITER //
CREATE TRIGGER update_order_status
AFTER UPDATE ON order_menus
FOR EACH ROW
BEGIN
    DECLARE total INT;
    DECLARE approved INT;
    DECLARE rejected INT;
    DECLARE cooking INT;
    DECLARE finished INT;
    DECLARE paid_status BOOLEAN;

    -- Get the total, approved, rejected, cooking, and finished counts
    SELECT total_menu, approved_menu, rejected_menu, cooking_menu, finished_menu, paid
    INTO total, approved, rejected, cooking, finished, paid_status
    FROM orders
    WHERE order_id = NEW.order_id;

    -- Update the order status based on conditions
    IF rejected = total THEN
        UPDATE orders SET order_status = 'rejected' WHERE order_id = NEW.order_id;
    ELSEIF approved > 0 AND NOT paid_status THEN
        UPDATE orders SET order_status = 'wait-pay' WHERE order_id = NEW.order_id;
    ELSEIF cooking > 0 THEN
        UPDATE orders SET order_status = 'cooking' WHERE order_id = NEW.order_id;
    ELSEIF approved > 0 AND finished = approved THEN
        UPDATE orders SET order_status = 'finished' WHERE order_id = NEW.order_id;
    ELSE
        UPDATE orders SET order_status = 'approved' WHERE order_id = NEW.order_id;
    END IF;
END //
DELIMITER ;

DELIMITER //
CREATE TRIGGER update_total_price_after_order_menu_status_change 
AFTER UPDATE ON order_menus
FOR EACH ROW
BEGIN
    -- Calculate the new total price for the order
    DECLARE new_total_price INT;
    SELECT SUM(price) INTO new_total_price
    FROM order_menus
    WHERE order_id = NEW.order_id AND order_menu_status != 'rejected';

    -- Update the total_price in the orders table
    UPDATE orders
    SET total_price = new_total_price
    WHERE order_id = NEW.order_id;
END//
DELIMITER ;

DELIMITER //
CREATE TRIGGER update_order_status_after_payment_insert
AFTER INSERT ON payments
FOR EACH ROW
BEGIN
    DECLARE total INT;
    DECLARE approved INT;
    DECLARE rejected INT;
    DECLARE cooking INT;
    DECLARE finished INT;
    DECLARE paid_status BOOLEAN;

    -- Get the total, approved, rejected, cooking, and finished counts
    SELECT total_price, approved_menu, rejected_menu, cooking_menu, finished_menu, paid
    INTO total, approved, rejected, cooking, finished, paid_status
    FROM orders
    WHERE order_id = NEW.order_id;

    -- Update the order status based on conditions
    IF rejected = total THEN
        UPDATE orders SET order_status = 'rejected' WHERE order_id = NEW.order_id;
    ELSEIF approved > 0 AND NOT paid_status THEN
        UPDATE orders SET order_status = 'wait-pay' WHERE order_id = NEW.order_id;
    ELSEIF cooking > 0 THEN
        UPDATE orders SET order_status = 'cooking' WHERE order_id = NEW.order_id;
    ELSEIF approved > 0 AND finished = approved THEN
        UPDATE orders SET order_status = 'finished' WHERE order_id = NEW.order_id;
    ELSE
        UPDATE orders SET order_status = 'approved' WHERE order_id = NEW.order_id;
    END IF;
END //
DELIMITER ;
