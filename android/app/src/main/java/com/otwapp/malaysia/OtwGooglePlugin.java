package com.otwapp.malaysia;

import android.os.CancellationSignal;
import androidx.core.content.ContextCompat;
import androidx.credentials.Credential;
import androidx.credentials.CredentialManager;
import androidx.credentials.CredentialManagerCallback;
import androidx.credentials.CustomCredential;
import androidx.credentials.GetCredentialRequest;
import androidx.credentials.GetCredentialResponse;
import androidx.credentials.exceptions.GetCredentialCancellationException;
import androidx.credentials.exceptions.GetCredentialException;
import androidx.credentials.exceptions.NoCredentialException;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption;
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential;

/**
 * "Sign in with Google" inside the app. Google's web button can't work in an
 * app, so Android's own account picker is used instead. It hands back the same
 * signed answer the website gets, made out to OTW's website client, so OTW's
 * server checks both the same way. The pages reach it as "OtwGoogle".
 *
 * Google only answers an app it knows: the Google Cloud project needs an Android
 * client with this app's ID and the fingerprint of the key it was signed with.
 */
@CapacitorPlugin(name = "OtwGoogle")
public class OtwGooglePlugin extends Plugin {

    @PluginMethod
    public void signIn(PluginCall call) {
        String clientId = call.getString("clientId");
        String nonce = call.getString("nonce");
        if (clientId == null || nonce == null) {
            call.reject("Missing the client ID or nonce");
            return;
        }
        GetSignInWithGoogleOption google = new GetSignInWithGoogleOption.Builder(clientId).setNonce(nonce).build();
        GetCredentialRequest request = new GetCredentialRequest.Builder().addCredentialOption(google).build();
        CredentialManager.create(getContext()).getCredentialAsync(
            getActivity(),
            request,
            new CancellationSignal(),
            ContextCompat.getMainExecutor(getContext()),
            new CredentialManagerCallback<GetCredentialResponse, GetCredentialException>() {
                @Override
                public void onResult(GetCredentialResponse response) {
                    Credential credential = response.getCredential();
                    if (
                        credential instanceof CustomCredential &&
                        GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL.equals(credential.getType())
                    ) {
                        JSObject result = new JSObject();
                        result.put("credential", GoogleIdTokenCredential.createFrom(credential.getData()).getIdToken());
                        call.resolve(result);
                    } else {
                        call.reject("Google sent an answer OTW can't use", "UNEXPECTED");
                    }
                }

                @Override
                public void onError(GetCredentialException e) {
                    if (e instanceof GetCredentialCancellationException) {
                        call.reject("Cancelled", "CANCELLED");
                    } else if (e instanceof NoCredentialException) {
                        call.reject("No Google account on this phone", "NO_ACCOUNT");
                    } else {
                        call.reject(e.getMessage() != null ? e.getMessage() : e.getType(), "FAILED");
                    }
                }
            }
        );
    }
}
