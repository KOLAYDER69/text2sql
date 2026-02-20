-- QueryBot Demo Schema: E-commerce (Russian data)

-- Create readonly role for querybot
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'querybot_readonly') THEN
    CREATE ROLE querybot_readonly WITH LOGIN PASSWORD 'querybot_readonly_pass';
  END IF;
END
$$;

-- Tables

CREATE TABLE IF NOT EXISTS customers (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  city TEXT NOT NULL,
  registered_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS categories (
  id SERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS products (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  category_id INT REFERENCES categories(id),
  price NUMERIC(10,2) NOT NULL,
  stock INT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS orders (
  id SERIAL PRIMARY KEY,
  customer_id INT REFERENCES customers(id),
  status TEXT NOT NULL CHECK (status IN ('new', 'processing', 'shipped', 'delivered', 'cancelled')),
  total NUMERIC(10,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS order_items (
  id SERIAL PRIMARY KEY,
  order_id INT REFERENCES orders(id),
  product_id INT REFERENCES products(id),
  quantity INT NOT NULL,
  price NUMERIC(10,2) NOT NULL
);

-- Seed data

-- Categories
INSERT INTO categories (name) VALUES
  ('Электроника'),
  ('Одежда'),
  ('Книги'),
  ('Дом и сад'),
  ('Спорт')
ON CONFLICT DO NOTHING;

-- Products
INSERT INTO products (name, category_id, price, stock) VALUES
  ('Смартфон Samsung Galaxy S24', 1, 79990.00, 45),
  ('Ноутбук ASUS VivoBook 15', 1, 54990.00, 20),
  ('Наушники Sony WH-1000XM5', 1, 29990.00, 60),
  ('Куртка зимняя мужская', 2, 12990.00, 35),
  ('Джинсы Levi''s 501', 2, 8490.00, 80),
  ('Футболка хлопковая', 2, 1990.00, 150),
  ('Война и мир (Толстой)', 3, 890.00, 200),
  ('Мастер и Маргарита (Булгаков)', 3, 650.00, 180),
  ('Python. Чистый код', 3, 1490.00, 90),
  ('Кофемашина DeLonghi', 4, 34990.00, 15),
  ('Набор постельного белья', 4, 4990.00, 70),
  ('Робот-пылесос Xiaomi', 4, 24990.00, 25),
  ('Велосипед горный Trek', 5, 45990.00, 10),
  ('Гантели разборные 20кг', 5, 5990.00, 40),
  ('Коврик для йоги', 5, 1890.00, 100)
ON CONFLICT DO NOTHING;

-- Customers
INSERT INTO customers (name, email, city, registered_at) VALUES
  ('Иванов Алексей', 'ivanov@mail.ru', 'Москва', '2024-01-15'),
  ('Петрова Мария', 'petrova@gmail.com', 'Санкт-Петербург', '2024-01-20'),
  ('Сидоров Дмитрий', 'sidorov@yandex.ru', 'Новосибирск', '2024-02-01'),
  ('Козлова Анна', 'kozlova@mail.ru', 'Екатеринбург', '2024-02-10'),
  ('Морозов Сергей', 'morozov@gmail.com', 'Казань', '2024-02-15'),
  ('Новикова Елена', 'novikova@yandex.ru', 'Нижний Новгород', '2024-03-01'),
  ('Волков Андрей', 'volkov@mail.ru', 'Челябинск', '2024-03-10'),
  ('Соколова Ольга', 'sokolova@gmail.com', 'Самара', '2024-03-15'),
  ('Лебедев Максим', 'lebedev@yandex.ru', 'Ростов-на-Дону', '2024-04-01'),
  ('Кузнецова Татьяна', 'kuznetsova@mail.ru', 'Уфа', '2024-04-10'),
  ('Попов Николай', 'popov@gmail.com', 'Красноярск', '2024-04-15'),
  ('Зайцева Наталья', 'zaitseva@yandex.ru', 'Пермь', '2024-05-01'),
  ('Павлов Игорь', 'pavlov@mail.ru', 'Воронеж', '2024-05-10'),
  ('Семенова Юлия', 'semenova@gmail.com', 'Волгоград', '2024-05-15'),
  ('Голубев Артем', 'golubev@yandex.ru', 'Краснодар', '2024-06-01'),
  ('Виноградова Ирина', 'vinogradova@mail.ru', 'Саратов', '2024-06-10'),
  ('Богданов Роман', 'bogdanov@gmail.com', 'Тюмень', '2024-06-15'),
  ('Воробьева Светлана', 'vorobyeva@yandex.ru', 'Тольятти', '2024-07-01'),
  ('Федоров Владимир', 'fedorov@mail.ru', 'Ижевск', '2024-07-10'),
  ('Михайлова Дарья', 'mikhailova@gmail.com', 'Барнаул', '2024-07-15'),
  ('Беляев Константин', 'belyaev@yandex.ru', 'Ульяновск', '2024-08-01'),
  ('Тарасова Екатерина', 'tarasova@mail.ru', 'Владивосток', '2024-08-10'),
  ('Белов Александр', 'belov@gmail.com', 'Хабаровск', '2024-08-15'),
  ('Комарова Валерия', 'komarova@yandex.ru', 'Оренбург', '2024-09-01'),
  ('Орлов Денис', 'orlov@mail.ru', 'Рязань', '2024-09-10'),
  ('Киселева Полина', 'kiseleva@gmail.com', 'Пенза', '2024-09-15'),
  ('Макаров Евгений', 'makarov@yandex.ru', 'Липецк', '2024-10-01'),
  ('Андреева Алина', 'andreeva@mail.ru', 'Калининград', '2024-10-10'),
  ('Ковалев Тимур', 'kovalev@gmail.com', 'Сочи', '2024-10-15'),
  ('Ильина Вера', 'ilyina@yandex.ru', 'Астрахань', '2024-11-01')
ON CONFLICT DO NOTHING;

-- Orders (26 orders across different statuses)
INSERT INTO orders (customer_id, status, total, created_at) VALUES
  (1, 'delivered', 79990.00, '2024-03-01'),
  (1, 'delivered', 8490.00, '2024-05-10'),
  (2, 'delivered', 30880.00, '2024-03-15'),
  (3, 'delivered', 54990.00, '2024-04-01'),
  (4, 'shipped', 13880.00, '2024-06-01'),
  (5, 'delivered', 45990.00, '2024-06-10'),
  (6, 'delivered', 1540.00, '2024-07-01'),
  (7, 'processing', 34990.00, '2024-07-15'),
  (8, 'delivered', 3980.00, '2024-08-01'),
  (9, 'shipped', 24990.00, '2024-08-10'),
  (10, 'delivered', 5990.00, '2024-08-15'),
  (11, 'cancelled', 79990.00, '2024-09-01'),
  (12, 'delivered', 4990.00, '2024-09-10'),
  (13, 'processing', 109980.00, '2024-09-15'),
  (14, 'delivered', 2540.00, '2024-10-01'),
  (15, 'new', 29990.00, '2024-10-10'),
  (2, 'delivered', 12990.00, '2024-10-15'),
  (16, 'shipped', 1890.00, '2024-10-20'),
  (17, 'new', 8490.00, '2024-11-01'),
  (18, 'delivered', 890.00, '2024-11-05'),
  (19, 'processing', 59980.00, '2024-11-10'),
  (20, 'new', 1490.00, '2024-11-15'),
  (3, 'shipped', 29990.00, '2024-11-20'),
  (21, 'cancelled', 45990.00, '2024-11-25'),
  (22, 'new', 34990.00, '2024-12-01'),
  (5, 'processing', 11980.00, '2024-12-05')
ON CONFLICT DO NOTHING;

-- Order Items
INSERT INTO order_items (order_id, product_id, quantity, price) VALUES
  (1, 1, 1, 79990.00),
  (2, 5, 1, 8490.00),
  (3, 3, 1, 29990.00),
  (3, 7, 1, 890.00),
  (4, 2, 1, 54990.00),
  (5, 4, 1, 12990.00),
  (5, 7, 1, 890.00),
  (6, 13, 1, 45990.00),
  (7, 7, 1, 890.00),
  (7, 8, 1, 650.00),
  (8, 10, 1, 34990.00),
  (9, 6, 2, 1990.00),
  (10, 12, 1, 24990.00),
  (11, 14, 1, 5990.00),
  (12, 1, 1, 79990.00),
  (13, 11, 1, 4990.00),
  (14, 1, 1, 79990.00),
  (14, 3, 1, 29990.00),
  (15, 8, 1, 650.00),
  (15, 15, 1, 1890.00),
  (16, 3, 1, 29990.00),
  (17, 4, 1, 12990.00),
  (18, 15, 1, 1890.00),
  (19, 5, 1, 8490.00),
  (20, 7, 1, 890.00),
  (21, 3, 2, 29990.00),
  (22, 9, 1, 1490.00),
  (23, 3, 1, 29990.00),
  (24, 13, 1, 45990.00),
  (25, 10, 1, 34990.00),
  (26, 14, 2, 5990.00)
ON CONFLICT DO NOTHING;

-- Grant readonly access
GRANT USAGE ON SCHEMA public TO querybot_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO querybot_readonly;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO querybot_readonly;
