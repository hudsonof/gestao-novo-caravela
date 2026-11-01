import { prisma } from "@/lib/db";
export async function getOverview() {
 const [events, sessions, accounts, expenses, recent] = await Promise.all([
  prisma.event.findMany({orderBy:{startsAt:"desc"},take:8}),
  prisma.cashSession.findMany({where:{status:"OPEN"},include:{register:true,account:true,event:true,employee:true},take:20}),
  prisma.financialAccount.findMany({where:{kind:{in:["FUND","VAULT","CASH","TRANSIT"]}}}),
  prisma.expense.findMany({where:{status:{in:["OPEN","PARTIAL"]}},orderBy:{dueDate:"asc"},take:8}),
  prisma.ledgerEntry.findMany({orderBy:{createdAt:"desc"},take:8})
 ]);
 return {events,sessions,accounts,expenses,recent};
}
