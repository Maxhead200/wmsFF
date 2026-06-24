create table if not exists clients (
    id varchar(32) primary key,
    name varchar(255) not null,
    legal_name varchar(255) not null,
    inn varchar(32),
    status varchar(32) not null,
    debt numeric(14, 2) not null default 0
);

create table if not exists app_users (
    id varchar(32) primary key,
    login varchar(120) not null unique,
    display_name varchar(255) not null,
    role varchar(64) not null,
    client_id varchar(32) references clients(id),
    status varchar(32) not null
);

create table if not exists products (
    id varchar(32) primary key,
    client_id varchar(32) not null references clients(id),
    sku varchar(120) not null,
    name varchar(255) not null,
    barcode varchar(120),
    status varchar(32) not null
);

create table if not exists stock_items (
    id varchar(32) primary key,
    client_id varchar(32) not null references clients(id),
    product_id varchar(32) not null references products(id),
    location varchar(64) not null,
    available integer not null,
    reserved integer not null,
    quarantine integer not null
);

create table if not exists audit_events (
    id varchar(32) primary key,
    at timestamp not null,
    actor varchar(120) not null,
    action varchar(120) not null,
    entity varchar(120) not null,
    details text not null
);
