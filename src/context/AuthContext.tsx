import {createContext,useContext,useEffect,useState} from "react";
import type {Session,User} from "@supabase/supabase-js";import {supabase} from "../services/supabase";
export type Role="employee"|"manager"|"ceo"|"admin";
type AuthContextValue={session:Session|null;user:User|null;role:Role|null;organizationId:string|null;loading:boolean;signIn:(email:string,password:string)=>Promise<void>;signOut:()=>Promise<void>};
const AuthContext=createContext<AuthContextValue|undefined>(undefined);
export function AuthProvider({children}:{children:React.ReactNode}){const[session,setSession]=useState<Session|null>(null);const[role,setRole]=useState<Role|null>(null);const[organizationId,setOrganizationId]=useState<string|null>(null);const[loading,setLoading]=useState(true);
const loadMembership=async(user:User|null)=>{if(!user||!supabase){setRole(null);setOrganizationId(null);return;}const{data}=await supabase.from("organization_members").select("organization_id,role").eq("user_id",user.id).eq("active",true).limit(1).maybeSingle();setRole(data?.role ? data.role as Role : null);setOrganizationId(data?.organization_id??null);};
useEffect(()=>{if(!supabase){setLoading(false);return;}supabase.auth.getSession().then(async({data})=>{setSession(data.session);await loadMembership(data.session?.user??null);setLoading(false);});const{data}=supabase.auth.onAuthStateChange(async(_event,next)=>{setSession(next);await loadMembership(next?.user??null);setLoading(false);});return()=>data.subscription.unsubscribe();},[]);
const signIn=async(email:string,password:string)=>{if(!supabase)throw new Error("Supabase is not configured.");const{error}=await supabase.auth.signInWithPassword({email,password});if(error)throw error;};
const signOut=async()=>{if(supabase)await supabase.auth.signOut();};
return <AuthContext.Provider value={{session,user:session?.user??null,role,organizationId,loading,signIn,signOut}}>{children}</AuthContext.Provider>;}
export function useAuth(){const context=useContext(AuthContext);if(!context)throw new Error("useAuth must be used inside AuthProvider");return context;}