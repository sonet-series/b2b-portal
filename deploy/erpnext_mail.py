# Sends one email through ERPNext's default outgoing account (the Gmail account
# "Sonet"), the same route /root/backup-erp.sh uses for ERPNext's own backup alerts.
# No mail credential ever leaves ERPNext. Runs INSIDE frappe-backend-1 with the
# bench's python, from sites/ (deploy/offsite.sh copies it in and removes it after):
#
#   python erpnext_mail.py <to> <subject-file> <body-file>   send it
#   python erpnext_mail.py --check                           find the account, send nothing
#
# Temporary, Sonet 21 Oct 2026: replaced by a seriestours.com sender before the ERP
# emails customers, and it goes away with ERPNext at cut-over (see TODO.md).
import sys

import frappe

frappe.init(site="erp.seriestours.com")
frappe.connect()
try:
    if sys.argv[1] == "--check":
        account = frappe.db.get_value(
            "Email Account",
            {"default_outgoing": 1, "enable_outgoing": 1},
            ["name", "email_id"],
            as_dict=True,
        )
        print(f"OUTGOING_OK {account.name} <{account.email_id}>" if account else "NO_OUTGOING_ACCOUNT")
    else:
        to, subject_file, body_file = sys.argv[1:4]
        frappe.sendmail(
            recipients=[to],
            subject=open(subject_file).read().strip(),
            message=open(body_file).read(),
            now=True,
        )
        frappe.db.commit()  # the bench's python does not commit on its own
        print("MAIL_SENT")
finally:
    frappe.destroy()
