import { describe,it,expect } from "vitest";
import { money,positiveMoney } from "../src/lib/money";
describe("money",()=>{
 it("aceita centavos exatos",()=>expect(money("10.25").toString()).toBe("10.25"));
 it("rejeita precisão inválida",()=>expect(()=>money("0.001")).toThrow());
 it("rejeita valor negativo para lançamentos",()=>expect(()=>positiveMoney("-1")).toThrow());
});
