export function recentAuthentication(claims,ownerId,now=Date.now()) {
    if(claims?.sub!==ownerId || !Number.isFinite(claims?.exp) || claims.exp*1000<=now || !Array.isArray(claims.amr))return false;
    // iat can be renewed by token refresh. Only a real authentication method counts.
    return claims.amr.some(item=>['password','oauth','otp','totp','sso/saml'].includes(item?.method) && Number.isFinite(item.timestamp) && now>=item.timestamp*1000 && now-item.timestamp*1000<=600000);
  }
export async function deleteOwnAccount(admin,token,ownerId) {
    const revoked=await admin.auth.admin.signOut(token,'global');
    if(revoked.error)throw Error('session_revoke_failed');
    const deleted=await admin.auth.admin.deleteUser(ownerId,false);
    if(deleted.error)throw Error('account_delete_failed');
  }
