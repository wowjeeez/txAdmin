import Avatar from "@/components/Avatar";
import { Button } from "@/components/ui/button";
import { CardContent, CardFooter } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/auth";
import { Label } from "@radix-ui/react-label";
import { ApiAddMasterCallbackFivemData, ApiAddMasterCallbackReq, ApiAddMasterCallbackResp, ApiAddMasterSaveReq, ApiAddMasterSaveResp, ApiOauthCallbackErrorResp } from "@shared/authApiTypes";
import { useMutation } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import OauthErrors from "./components/OauthErrors";
import GenericSpinner from "@/components/GenericSpinner";
import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import consts from "@shared/consts";


function RegisterForm({ fivemId, fivemName, profilePicture }: ApiAddMasterCallbackFivemData) {
    const { setAuthData } = useAuth();
    const [errorMessage, setErrorMessage] = useState<string | undefined>();
    const discordRef = useRef<HTMLInputElement>(null);
    const passwordRef = useRef<HTMLInputElement>(null);
    const password2Ref = useRef<HTMLInputElement>(null);
    const termsRef = useRef<typeof CheckboxPrimitive.Root>(null);

    const submitMutation = useMutation<
        ApiAddMasterSaveResp,
        Error,
        ApiAddMasterSaveReq
    >({
        mutationKey: ['auth'],
        mutationFn: ({ discordId, password }) => fetch('/auth/addMaster/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ discordId, password })
        }).then(res => res.json()),
        onSuccess: (data) => {
            if ('error' in data) {
                setErrorMessage(data.error);
            } else {
                //Hacky override to prevent logout from rendering this page again
                window.txConsts.hasMasterAccount = true;
                setAuthData(data);
            }
        },
        onError: (error: Error) => {
            if (error.message.startsWith('NetworkError')) {
                setErrorMessage('Network error. If you closed txAdmin, please restart it and try again.');
            } else {
                setErrorMessage(error.message);
            }
        },
    });

    const handleSubmit = (event?: React.FormEvent<HTMLFormElement>) => {
        event?.preventDefault();
        setErrorMessage(undefined);

        //Clean and check discord id
        let discordId: string | undefined;
        let discordInput = discordRef.current?.value?.trim();
        if (typeof discordInput === 'string' && discordInput.length > 0) {
            if (discordInput.startsWith('discord:')) {
                discordInput = discordInput.substring(8);
                discordRef.current!.value = discordInput;
            }
            if (!consts.validIdentifierParts.discord.test(discordInput)) {
                setErrorMessage('The Discord ID needs to be the numeric "User ID" instead of the username.\n You can also leave it blank.');
                return;
            }
            discordId = discordInput;
        }

        // @ts-ignore - Check terms
        if (termsRef.current?.value !== 'on') {
            setErrorMessage('You MUST agree to the terms.');
            return;
        }

        //Check passwords
        const password = passwordRef.current?.value || '';
        const password2 = password2Ref.current?.value || '';
        if (password.length < consts.adminPasswordMinLength || password.length > consts.adminPasswordMaxLength) {
            setErrorMessage(`The password must be between ${consts.adminPasswordMinLength} and ${consts.adminPasswordMaxLength} characters long.`);
            return;
        } else if (password !== password2) {
            setErrorMessage('The passwords do not match.');
            return;
        }

        //Mutate!
        submitMutation.mutate({ discordId, password });
    };

    //Prefill password if dev pass enabled
    useEffect(() => {
        try {
            const rawLocalStorageStr = localStorage.getItem('authCredsAutofill');
            if (rawLocalStorageStr) {
                const [user, pass] = JSON.parse(rawLocalStorageStr);
                passwordRef.current!.value = pass ?? '';
                password2Ref.current!.value = pass ?? '';
            }
        } catch (error) {
            console.error('Passwords autofill failed', error);
        }
    }, []);

    return <form onSubmit={handleSubmit} className='w-full text-left'>
        <CardContent className="flex flex-col gap-4">
            <div>
                Cfx.re account
                <div className="rounded-md border bg-zinc-100 dark:bg-zinc-900 p-2 mt-2 flex flex-row justify-start items-center">
                    <Avatar
                        className="h-16 w-16 text-3xl"
                        username={fivemName}
                        profilePicture={profilePicture}
                    />
                    <div className="text-left ml-4 overflow-hidden text-ellipsis">
                        <span className="text-2xl">{fivemName}</span> <br />
                        <code className="text-muted-foreground">{fivemId}</code>
                    </div>
                </div>
            </div>
            {/* This is so password managers save the username */}
            <input type="text" name="frm-username" className="hidden" value={fivemName} readOnly />
            <div className="grid gap-2">
                <div className="flex flex-row justify-between items-center">
                    <Label htmlFor="frm-discord">Discord ID</Label>
                    <span className="text-muted-foreground text-xs">(optional)</span>
                </div>
                <Input
                    className="dark:placeholder:text-zinc-800"
                    id="frm-discord" type="text" ref={discordRef}
                    placeholder='000000000000000000' disabled={submitMutation.isPending}
                />
            </div>
            <div className="grid gap-2">
                <div className="flex flex-row justify-between items-center">
                    <Label htmlFor="frm-password">Backup Password</Label>
                    <span className="text-muted-foreground text-xs">({consts.adminPasswordMinLength}~{consts.adminPasswordMaxLength} digits)</span>
                </div>
                <Input
                    className="dark:placeholder:text-zinc-800"
                    id="frm-password" type="password" ref={passwordRef}
                    placeholder='password' disabled={submitMutation.isPending}
                    required
                />
            </div>
            <div className="grid gap-2">
                <Label htmlFor="frm-password2">Confirm Password</Label>
                <Input
                    className="dark:placeholder:text-zinc-800"
                    id="frm-password2" type="password" ref={password2Ref}
                    placeholder='password' disabled={submitMutation.isPending}
                    required
                />
            </div>
            <div className="flex items-center space-x-2 mt-2">
                {/* @ts-ignore */}
                <Checkbox id="terms" ref={termsRef} required />
                <label
                    htmlFor="terms"
                    className="text-sm font-medium leading-4 peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                    I have read and agree to the <a href="https://fivem.net/terms" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">Creator PLA</a> as well as the <a href="https://github.com/tabarra/txAdmin/blob/master/LICENSE" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">txAdmin License</a>.
                </label>
            </div>
        </CardContent>
        <CardFooter className="flex-col gap-2">
            <span className="text-center text-destructive whitespace-pre-wrap">
                {errorMessage}
            </span>
            <Button className="w-full" disabled={submitMutation.isPending}>
                {submitMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Register
            </Button>
        </CardFooter>
    </form>
}


export default function AddMasterCallback() {
    const hasPendingMutation = useRef(false); //due to strict mode re-rendering
    const [fivemData, setFivemData] = useState<ApiAddMasterCallbackFivemData | undefined>();
    const [errorData, setErrorData] = useState<ApiOauthCallbackErrorResp | undefined>();

    const callbackMutation = useMutation<
        ApiAddMasterCallbackResp,
        Error,
        ApiAddMasterCallbackReq
    >({
        mutationKey: ['auth'],
        mutationFn: ({ redirectUri }) => fetch('/auth/addMaster/callback', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ redirectUri })
        }).then(res => res.json()),
        onSuccess: (data) => {
            if ('errorCode' in data || 'errorTitle' in data) {
                setErrorData(data);
            } else {
                setFivemData(data);
            }
        },
        onError: (error) => {
            if (error.message.startsWith('NetworkError')) {
                setErrorData({
                    errorTitle: 'Network Error',
                    errorMessage: 'If you closed txAdmin, please restart it and try again.'
                });
            } else {
                setErrorData({
                    errorTitle: 'Unknown Error',
                    errorMessage: error.message
                });
            }
        }
    });

    //Auto submit callback to get the fivemData
    useEffect(() => {
        if (fivemData || hasPendingMutation.current) return;
        hasPendingMutation.current = true;
        callbackMutation.mutate({
            redirectUri: window.location.href
        });
        return callbackMutation.reset;
    }, []);

    if (fivemData) {
        return <RegisterForm {...fivemData} />
    } else if (errorData) {
        return <OauthErrors error={errorData} returnTo="/addMaster/pin" />
    } else {
        return <GenericSpinner msg="Authenticating..." />
    }
}
