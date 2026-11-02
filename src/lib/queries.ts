import { prisma } from "@/lib/db";
export async function getOverview(eventId?: string) {
 const [events, sessions, accounts, expenses, compensations, recent] = await Promise.all([
  prisma.event.findMany({where: eventId ? {id:eventId} : {},orderBy:{startsAt:"desc"},take:8}),
  prisma.cashSession.findMany({where:{status:"OPEN",...(eventId ? {eventId} : {})},include:{register:true,account:true,event:true,employee:true},take:50}),
  prisma.financialAccount.findMany({where:{kind:{in:["FUND","VAULT","CASH","TRANSIT"]}}}),
  prisma.expense.findMany({where:{status:{in:["OPEN","PARTIAL"]},...(eventId ? {eventId} : {})},orderBy:{dueDate:"asc"},take:8}),
  prisma.employeeCompensation.findMany({where:{status:{in:["OPEN","PARTIAL"]},...(eventId ? {eventId} : {})},include:{employee:true,payments:{include:{entry:{include:{reversals:true}}}}},orderBy:{dueDate:"asc"},take:8}),
  prisma.ledgerEntry.findMany({where:eventId ? {eventId} : {},orderBy:{createdAt:"desc"},take:8})
 ]);
 return {events,sessions,accounts,expenses,compensations,recent};
}
