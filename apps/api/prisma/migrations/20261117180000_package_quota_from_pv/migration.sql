-- Future package quota grants are derived from PV, not from the cash price.
UPDATE "Package"
SET "transferQuota" = "pv" * 3;
