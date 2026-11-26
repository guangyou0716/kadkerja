-- Who made each move: the workshop (STAFF) or the customer through the progress link (CUSTOMER).
-- Every move recorded before this version was made by staff.
alter table status_event add column actor varchar(10) default 'STAFF' not null;
